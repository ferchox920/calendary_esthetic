import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import makeWASocket, { Browsers } from 'baileys';
import pino from 'pino';
import { windowsKey, encryptedAuthStore } from './auth-store.mjs';
import { probeLock } from './probe.mjs';

// No message body/destination is returned. A sendMessage result alone is not server acceptance.
export async function sendWithAck(socket, { phoneE164, text, messageId, timeoutMs = 30000 }) {
  if (!/^\+[1-9]\d{7,14}$/.test(phoneE164) || !text.trim() || !messageId) throw new Error('Invalid test request');
  let timer,
    settled = false;
  let finish;
  const accepted = new Promise((resolve) => {
    finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
  });
  const ack = (node) => {
    if (node?.attrs?.id !== messageId) return;
    finish(
      node.attrs.error ? { state: 'failed', reason: 'server_rejected' } : { state: 'accepted', reason: 'server_ack' }
    );
  };
  const updates = (messages) => {
    for (const item of messages) {
      if (item?.key?.id === messageId && item.key.fromMe && Number(item.update?.status) >= 2)
        finish({ state: 'accepted', reason: 'message_ack' });
    }
  };
  const closed = ({ connection }) => {
    if (connection === 'close') finish({ state: 'uncertain', reason: 'connection_lost' });
  };
  socket.ws.on('CB:ack,class:message', ack);
  socket.ev.on('messages.update', updates);
  socket.ev.on('connection.update', closed);
  try {
    timer = setTimeout(() => finish({ state: 'uncertain', reason: 'ack_timeout' }), timeoutMs);
    void Promise.resolve()
      .then(() => socket.sendMessage(`${phoneE164.slice(1)}@s.whatsapp.net`, { text }, { messageId }))
      .catch(() => finish({ state: 'uncertain', reason: 'send_result_unknown' }));
    return await accepted;
  } finally {
    clearTimeout(timer);
    socket.ws.off('CB:ack,class:message', ack);
    socket.ev.off('messages.update', updates);
    socket.ev.off('connection.update', closed);
  }
}

export async function sendAuthorizedSessionTest({ phoneE164, text, begin, complete }) {
  const directory = fileURLToPath(new URL('../../.local/whatsapp-probe/', import.meta.url));
  const key = await windowsKey(directory),
    unlock = await probeLock(directory);
  let socket, auth;
  let stage = 'authentication';
  try {
    auth = await encryptedAuthStore(directory, key);
    if (!auth.state.creds.registered) throw new Error('Linked session required');
    stage = 'connection';
    let credentialWrites = Promise.resolve();
    socket = makeWASocket({
      auth: auth.state,
      logger: pino({ level: 'silent' }),
      browser: Browsers.windows('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      emitOwnEvents: false,
      getMessage: async () => undefined,
      maxMsgRetryCount: 0,
      connectTimeoutMs: 20000,
    });
    socket.ev.on('creds.update', (update) => {
      credentialWrites = credentialWrites.then(() => auth.saveCreds(update));
      void credentialWrites.catch(() => socket.end(new Error('Credential storage unavailable')));
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => done(new Error('Connection timeout')), 30000);
      const changed = ({ connection }) => {
        if (connection === 'open') done();
        else if (connection === 'close') done(new Error('Connection closed'));
      };
      function done(error) {
        clearTimeout(timeout);
        socket.ev.off('connection.update', changed);
        error ? reject(error) : resolve();
      }
      socket.ev.on('connection.update', changed);
    });
    await credentialWrites;
    stage = 'attempt_registration';
    const messageId = `3EB0${randomBytes(18).toString('hex').toUpperCase()}`;
    // begin must validate the current appointment and COMMIT the attempt before any send.
    const previous = await begin(messageId);
    if (previous) return previous;
    stage = 'dispatch';
    const result = await sendWithAck(socket, { phoneE164, text, messageId });
    await complete({ ...result, messageId });
    return result;
  } catch (error) {
    const safe = new Error('Session test did not complete');
    safe.testStage = stage;
    throw safe;
  } finally {
    socket?.end(new Error('Authorized test finished'));
    try {
      await auth?.flush();
    } finally {
      await unlock();
    }
  }
}
