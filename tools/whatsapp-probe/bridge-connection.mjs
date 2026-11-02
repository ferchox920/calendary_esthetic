import makeWASocket, { Browsers, DisconnectReason } from 'baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { randomInt } from 'node:crypto';
import { sendWithAck } from './send-once.mjs';

const failure = (code) => Object.assign(new Error('WhatsApp control rejected'), { controlCode: code });
// Connection changes never replay messages. Pairing material lives only in this process.
export function bridgeConnection(auth, makeSocket = makeWASocket, schedule = setTimeout, now = Date.now) {
  let socket,
    timer,
    expiryTimer,
    generation = 0,
    retries = 0,
    stopped = false;
  let state = auth.state.creds.registered ? 'disconnected' : 'unlinked',
    link;
  let writes = Promise.resolve();
  const metadata = () =>
    link
      ? {
          id: link.id,
          mode: link.mode,
          state: link.state,
          expiresAt: link.state === 'pending' || link.state === 'ready' ? new Date(link.deadline).toISOString() : null,
        }
      : null;
  const clearMaterial = () => {
    delete auth.state.creds.pairingCode;
    if (link) {
      delete link.material;
      delete link.phone;
    }
  };
  function endSocket() {
    generation++;
    clearTimeout(timer);
    socket?.end(new Error('Local connection stopped'));
    socket = undefined;
  }
  function failStorage() {
    state = 'storage_error';
    stopped = true;
    clearMaterial();
    clearTimeout(expiryTimer);
    endSocket();
  }
  function enqueue(action) {
    writes = writes.then(action);
    void writes.catch(failStorage);
    return writes;
  }
  function expire() {
    if (link && ['pending', 'ready'].includes(link.state) && now() >= link.deadline) {
      link.state = 'expired';
      clearMaterial();
      state = 'link_expired';
      endSocket();
    }
  }
  function connect() {
    if (stopped) return;
    const current = ++generation;
    state = 'connecting';
    const socketAuth = {
      creds: auth.state.creds,
      keys: {
        async get(...args) {
          if (generation !== current) throw failure('stale_connection');
          return auth.state.keys.get(...args);
        },
        async set(data) {
          if (generation !== current) throw failure('stale_connection');
          try {
            await auth.state.keys.set(data);
          } catch {
            failStorage();
            throw failure('storage_error');
          }
        },
      },
    };
    const created = makeSocket({
      auth: socketAuth,
      logger: pino({ level: 'silent' }),
      browser: Browsers.windows('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      emitOwnEvents: false,
      getMessage: async () => undefined,
      maxMsgRetryCount: 0,
      connectTimeoutMs: 20000,
      defaultQueryTimeoutMs: 10000,
      qrTimeout: 60000,
    });
    socket = created;
    created.ev.on('creds.update', (update) => {
      if (stopped || generation !== current) return;
      void enqueue(() => auth.saveCreds(update));
    });
    created.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (stopped || generation !== current) return;
      expire();
      if (generation !== current) return;
      if (qr && link && ['pending', 'ready'].includes(link.state)) {
        const active = link;
        void enqueue(async () => {
          if (
            generation !== current ||
            active !== link ||
            !['pending', 'ready'].includes(active.state) ||
            now() >= active.deadline
          )
            return;
          if (active.mode === 'code') {
            if (active.requested) return;
            active.requested = true;
            let code;
            try {
              code = await created.requestPairingCode(active.phone.slice(1), String(randomInt(10000000, 100000000)));
            } catch {
              if (generation === current) {
                active.state = 'failed';
                clearMaterial();
                state = 'disconnected';
                endSocket();
              }
              return;
            }
            if (
              generation !== current ||
              active !== link ||
              !['pending', 'ready'].includes(active.state) ||
              now() >= active.deadline
            )
              return;
            if (!/^\d{8}$/.test(code)) {
              active.state = 'failed';
              clearMaterial();
              endSocket();
              state = 'disconnected';
              return;
            }
            await auth.saveCreds();
            active.material = {
              code: `${code.slice(0, 4)}-${code.slice(4)}`,
              expiresAt: new Date(active.deadline).toISOString(),
            };
            delete active.phone;
          } else {
            const image = await QRCode.toDataURL(qr, { width: 420, margin: 4, errorCorrectionLevel: 'M' });
            if (
              generation !== current ||
              active !== link ||
              !['pending', 'ready'].includes(active.state) ||
              now() >= active.deadline
            )
              return;
            active.material = {
              qrDataUrl: image,
              expiresAt: new Date(Math.min(active.deadline, now() + 60000)).toISOString(),
            };
          }
          active.state = 'ready';
          state = active.mode === 'code' ? 'code_ready' : 'qr_ready';
        });
      }
      if (connection === 'open') {
        state = 'connected';
        retries = 0;
        if (link) link.state = 'connected';
        clearMaterial();
        clearTimeout(expiryTimer);
        void enqueue(() => auth.saveCreds());
      }
      if (connection === 'close') {
        generation++;
        if (link?.mode === 'qr') delete link.material;
        const code = lastDisconnect?.error?.output?.statusCode;
        const permanent = [
          DisconnectReason.loggedOut,
          DisconnectReason.badSession,
          DisconnectReason.connectionReplaced,
          DisconnectReason.forbidden,
          DisconnectReason.multideviceMismatch,
        ].includes(code);
        state = code === DisconnectReason.loggedOut ? 'logged_out' : 'disconnected';
        if (permanent || ++retries > 5) {
          if (link && ['pending', 'ready'].includes(link.state)) link.state = 'failed';
          clearMaterial();
          clearTimeout(expiryTimer);
          return;
        }
        state = 'reconnecting';
        const reconnectGeneration = generation;
        timer = schedule(
          () => {
            void writes
              .then(() => auth.flush())
              .then(() => {
                if (stopped || generation !== reconnectGeneration) return;
                expire();
                if (state !== 'link_expired') connect();
              })
              .catch(failStorage);
          },
          code === DisconnectReason.restartRequired ? 500 : Math.min(30000, 2000 * 2 ** (retries - 1))
        );
      }
    });
  }
  return {
    start() {
      if (auth.state.creds.registered) connect();
    },
    status() {
      expire();
      return { state, linked: !!auth.state.creds.registered, link: metadata() };
    },
    async beginLink({ id, mode, phoneE164 }) {
      expire();
      if (stopped) throw failure('storage_error');
      if (auth.state.creds.registered) throw failure('already_linked');
      if (link && ['pending', 'ready'].includes(link.state)) throw failure('link_in_progress');
      if (!['qr', 'code'].includes(mode) || (mode === 'code' && !/^\+[1-9]\d{7,14}$/.test(phoneE164)))
        throw failure('invalid_request');
      endSocket();
      await writes;
      await auth.flush();
      await auth.reset();
      retries = 0;
      link = { id, mode, phone: phoneE164, state: 'pending', deadline: now() + 120000 };
      expiryTimer = schedule(expire, 120000);
      connect();
      return { linkId: id };
    },
    challenge(id) {
      expire();
      if (!link || link.id !== id) throw failure('link_not_found');
      const material = link.material && now() < Date.parse(link.material.expiresAt) ? link.material : {};
      return { ...metadata(), ...material };
    },
    async reconnect() {
      if (stopped) throw failure('storage_error');
      if (!auth.state.creds.registered) throw failure('not_linked');
      if (state === 'connected' || state === 'connecting' || state === 'reconnecting') return {};
      endSocket();
      await writes;
      await auth.flush();
      retries = 0;
      connect();
      return {};
    },
    async disconnect() {
      if (stopped) throw failure('storage_error');
      const wasLinked = !!auth.state.creds.registered,
        active = socket;
      state = 'disconnecting';
      generation++;
      clearTimeout(timer);
      clearTimeout(expiryTimer);
      if (link) link.state = 'canceled';
      clearMaterial();
      let remoteLogout = wasLinked ? 'unconfirmed' : 'not_needed';
      if (wasLinked && active) {
        let timeout;
        try {
          await Promise.race([
            active.logout(),
            new Promise((_, reject) => {
              timeout = setTimeout(() => reject(failure('logout_timeout')), 10000);
            }),
          ]);
          remoteLogout = 'requested';
        } catch {
        } finally {
          clearTimeout(timeout);
        }
      }
      endSocket();
      await writes;
      await auth.flush();
      await auth.reset();
      state = 'unlinked';
      return { remoteLogout };
    },
    async dispatch(message) {
      await writes;
      if (state !== 'connected') return { state: 'failed' };
      return sendWithAck(socket, { ...message, timeoutMs: 15000 });
    },
    flush: () => writes,
    async stop() {
      stopped = true;
      clearTimeout(expiryTimer);
      clearMaterial();
      endSocket();
      state = 'stopped';
      await writes;
      await auth.flush();
    },
  };
}
