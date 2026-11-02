import { createServer } from 'node:http';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = (s) => createHash('sha256').update(s).digest();
export function bridgeServer({ token, ledger, connection, dispatch, controls, manager }) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid bridge token');
  let busy = false,
    controlling = false,
    storageFailed = false;
  const safeResult = (attemptId, record) => ({
    attemptId,
    state: record.state === 'processing' ? 'uncertain' : record.state,
    ...(record.state === 'accepted' ? { messageId: record.messageId } : {}),
    ...(record.state === 'not_accepted' ? { retryable: record.retryable === true } : {}),
  });
  const server = createServer(async (req, res) => {
    const respond = (code, value) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    if (!timingSafeEqual(digest(req.headers.authorization || ''), digest(`Bearer ${token}`))) {
      req.resume();
      respond(401, { error: 'unauthorized' });
      return;
    }
    try {
      if (req.method === 'GET' && req.url === '/status') {
        const current = connection();
        respond(200, {
          state: storageFailed ? 'storage_error' : current.state,
          available: current.state === 'connected' && !storageFailed && !controlling,
          ...(typeof current.linked === 'boolean' ? { linked: current.linked, link: current.link } : {}),
        });
        return;
      }
      const controlLookup = /^\/controls\/([0-9a-f-]+)$/i.exec(req.url || '');
      if (req.method === 'GET' && controlLookup && uuid.test(controlLookup[1]) && controls) {
        const record = controls.get(controlLookup[1]);
        respond(
          record ? 200 : 404,
          record
            ? {
                commandId: controlLookup[1],
                state: record.state === 'processing' ? 'uncertain' : record.state,
                ...(record.linkId ? { linkId: record.linkId } : {}),
                ...(record.reason ? { reason: record.reason } : {}),
                ...(record.remoteLogout ? { remoteLogout: record.remoteLogout } : {}),
              }
            : { error: 'not_found' }
        );
        return;
      }
      const challenge = /^\/links\/([0-9a-f-]+)$/i.exec(req.url || '');
      if (req.method === 'GET' && challenge && uuid.test(challenge[1]) && manager) {
        try {
          respond(200, manager.challenge(challenge[1]));
        } catch {
          respond(404, { error: 'link_not_found' });
        }
        return;
      }
      const lookup = /^\/attempts\/([0-9a-f-]+)$/i.exec(req.url || '');
      if (req.method === 'GET' && lookup && uuid.test(lookup[1])) {
        const record = ledger.get(lookup[1]);
        respond(record ? 200 : 404, record ? { ...safeResult(lookup[1], record), durable: true } : { error: 'not_found' });
        return;
      }
      if (req.method !== 'POST' || !['/attempts', '/controls'].includes(req.url)) {
        req.resume();
        respond(404, { error: 'not_found' });
        return;
      }
      let size = 0,
        chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) {
          respond(413, { error: 'invalid_request' });
          return;
        }
        chunks.push(chunk);
      }
      let message;
      try {
        message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        respond(400, { error: 'invalid_request' });
        return;
      }
      if (req.url === '/controls') {
        if (!controls || !manager) {
          respond(503, { error: 'unavailable' });
          return;
        }
        if (
          !message ||
          !uuid.test(message.commandId) ||
          !['link', 'reconnect', 'disconnect'].includes(message.action) ||
          Object.keys(message).some((k) => !['commandId', 'action', 'mode', 'phoneE164'].includes(k)) ||
          (message.action === 'link'
            ? !['qr', 'code'].includes(message.mode) ||
              (message.mode === 'code'
                ? typeof message.phoneE164 !== 'string' || !/^\+[1-9]\d{7,14}$/.test(message.phoneE164)
                : message.phoneE164 !== undefined)
            : message.mode !== undefined || message.phoneE164 !== undefined)
        ) {
          respond(400, { error: 'invalid_request' });
          return;
        }
        const fingerprint = controls.fingerprint({
          phoneE164: JSON.stringify([message.action, message.mode, message.phoneE164]),
          text: '',
        });
        const previous = controls.get(message.commandId);
        const view = (record) => ({
          commandId: message.commandId,
          state: record.state === 'processing' ? 'uncertain' : record.state,
          ...(record.linkId ? { linkId: record.linkId } : {}),
          ...(record.reason ? { reason: record.reason } : {}),
          ...(record.remoteLogout ? { remoteLogout: record.remoteLogout } : {}),
        });
        if (previous) {
          respond(
            previous.fingerprint === fingerprint ? 200 : 409,
            previous.fingerprint === fingerprint ? view(previous) : { error: 'command_conflict' }
          );
          return;
        }
        if (storageFailed) {
          respond(503, { error: 'storage_unavailable' });
          return;
        }
        const unavailable = busy || controlling;
        if (!unavailable) controlling = true;
        try {
          if (!(await controls.begin(message.commandId, fingerprint, null))) {
            respond(200, view(controls.get(message.commandId)));
            return;
          }
          let result;
          if (unavailable) result = { state: 'rejected', reason: 'busy' };
          else {
            try {
              const details =
                message.action === 'link'
                  ? await manager.beginLink({ id: message.commandId, mode: message.mode, phoneE164: message.phoneE164 })
                  : message.action === 'disconnect'
                    ? await manager.disconnect()
                    : await manager.reconnect();
              result = { state: 'completed', ...details };
            } catch (error) {
              const code = error.controlCode;
              result = ['already_linked', 'link_in_progress', 'not_linked', 'invalid_request'].includes(code)
                ? { state: 'rejected', reason: code }
                : { state: 'uncertain', reason: 'control_unknown' };
              if (code === 'storage_error') storageFailed = true;
            }
          }
          await controls.finish(message.commandId, result);
          respond(200, view(controls.get(message.commandId)));
        } catch {
          storageFailed = true;
          respond(500, { error: 'storage_unavailable' });
        } finally {
          if (!unavailable) controlling = false;
        }
        return;
      }
      if (
        !message ||
        !uuid.test(message.attemptId) ||
        typeof message.phoneE164 !== 'string' ||
        !/^\+[1-9]\d{7,14}$/.test(message.phoneE164) ||
        typeof message.text !== 'string' ||
        !message.text.trim() ||
        message.text.length > 2048 ||
        Object.keys(message).some((k) => !['attemptId', 'phoneE164', 'text'].includes(k))
      ) {
        respond(400, { error: 'invalid_request' });
        return;
      }
      const fingerprint = ledger.fingerprint(message),
        previous = ledger.get(message.attemptId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          respond(409, { error: 'attempt_conflict' });
          return;
        }
        respond(200, safeResult(message.attemptId, previous));
        return;
      }
      if (storageFailed) {
        respond(500, { error: 'storage_unavailable' });
        return;
      }
      if (busy || controlling || connection().state !== 'connected') {
        try {
          if (await ledger.begin(message.attemptId, fingerprint, null))
            await ledger.finish(message.attemptId, { state: 'not_accepted', retryable: true });
          respond(200, safeResult(message.attemptId, ledger.get(message.attemptId)));
        } catch {
          storageFailed = true;
          respond(500, { error: 'storage_unavailable' });
        }
        return;
      }
      busy = true;
      try {
        const messageId = `3EB0${randomBytes(18).toString('hex').toUpperCase()}`;
        if (!(await ledger.begin(message.attemptId, fingerprint, messageId))) {
          respond(200, safeResult(message.attemptId, ledger.get(message.attemptId)));
          return;
        }
        let result;
        try {
          result = await dispatch({ ...message, messageId });
        } catch {
          result = { state: 'uncertain', reason: 'dispatch_unknown' };
        }
        if (!['accepted', 'failed', 'uncertain'].includes(result?.state))
          result = { state: 'uncertain', reason: 'dispatch_unknown' };
        await ledger.finish(message.attemptId, { state: result.state === 'failed' ? 'not_accepted' : result.state });
        respond(200, safeResult(message.attemptId, ledger.get(message.attemptId)));
      } catch {
        storageFailed = true;
        respond(500, { error: 'storage_unavailable' });
      } finally {
        busy = false;
      }
    } catch {
      if (!res.headersSent) respond(400, { error: 'invalid_request' });
      else res.destroy();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
