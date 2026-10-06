import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { randomUUID, randomInt } from 'node:crypto';
import { join } from 'node:path';
import QRCode from 'qrcode';
import makeWASocket, { DisconnectReason, Browsers } from 'baileys';
import pino from 'pino';

export async function probeLock(directory) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'process.lock'),
    token = randomUUID();
  for (let tries = 0; tries < 2; tries++) {
    try {
      await writeFile(path, JSON.stringify({ pid: process.pid, token }), { flag: 'wx', mode: 0o600 });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const lock = JSON.parse(await readFile(path, 'utf8'));
      if (!Number.isInteger(lock.pid) || lock.pid <= 0) throw new Error('Bloqueo local inválido');
      try {
        process.kill(lock.pid, 0);
        throw new Error('La prueba de WhatsApp ya está ejecutándose');
      } catch (err) {
        if (err.code !== 'ESRCH') throw err;
      }
      await unlink(path);
      if (tries === 1) throw new Error('No se pudo reclamar la sesión local');
    }
  }
  return async () => {
    try {
      const lock = JSON.parse(await readFile(path, 'utf8'));
      if (lock.token === token) await unlink(path);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  };
}

// Link-only harness. Intentionally has no sendMessage call or incoming-message handlers.
export function createProbe({
  directory,
  auth,
  makeSocket = makeWASocket,
  onStatus = () => {},
  schedule = setTimeout,
  phoneNumber,
}) {
  let socket,
    reconnect,
    stopped = false,
    generation = 0,
    retries = 0,
    codeRequested = false;
  let tasks = Promise.resolve();
  const qrPath = join(directory, 'qr.png');
  const codePath = join(directory, 'pairing-code.txt');
  function enqueue(action) {
    tasks = tasks.then(action).catch(async () => {
      await stop('storage_error');
    });
    return tasks;
  }
  async function status(state, code) {
    const safe = {
      state,
      updatedAt: new Date().toISOString(),
      sendEnabled: false,
      ...(Number.isInteger(code) ? { disconnectCode: code } : {}),
    };
    await writeFile(join(directory, 'status.tmp'), JSON.stringify(safe), { mode: 0o600 });
    await rename(join(directory, 'status.tmp'), join(directory, 'status.json'));
    onStatus(safe);
  }
  async function removeQR() {
    try {
      await unlink(qrPath);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  async function removeCode() {
    try {
      await unlink(codePath);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  async function stop(state = 'stopped') {
    if (stopped) return;
    stopped = true;
    generation++;
    if (reconnect) clearTimeout(reconnect);
    socket?.end(new Error('Local probe stopped'));
    try {
      await auth.flush();
    } catch {}
    await removeQR();
    await removeCode();
    await status(state);
  }
  async function connect() {
    if (stopped) return;
    const current = ++generation;
    await removeQR();
    await status('connecting');
    socket = makeSocket({
      auth: auth.state,
      logger: pino({ level: 'silent' }),
      browser: Browsers.windows('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      emitOwnEvents: false,
      getMessage: async () => undefined,
      connectTimeoutMs: 20000,
    });
    socket.ev.on('creds.update', (update) => {
      void enqueue(() => auth.saveCreds(update));
    });
    socket.ev.on('connection.update', (update) => {
      void enqueue(async () => {
        if (stopped || generation !== current) return;
        const { connection, qr, lastDisconnect } = update;
        if (qr && phoneNumber && !auth.state.creds?.registered && !codeRequested) {
          codeRequested = true;
          const code = await socket.requestPairingCode(phoneNumber, String(randomInt(10000000, 100000000)));
          if (!/^\d{8}$/.test(code)) throw new Error('Invalid numeric pairing code');
          await auth.saveCreds();
          await writeFile(codePath, `${code.slice(0, 4)}-${code.slice(4)}\n`, { mode: 0o600 });
          await status('code_ready');
        }
        if (qr && !phoneNumber) {
          await QRCode.toFile(join(directory, 'qr.tmp.png'), qr, { width: 420, margin: 4, errorCorrectionLevel: 'M' });
          await rename(join(directory, 'qr.tmp.png'), qrPath);
          await status('qr_ready');
        }
        if (connection === 'open') {
          retries = 0;
          await auth.saveCreds();
          await removeQR();
          await removeCode();
          await status('connected');
        }
        if (connection === 'close') {
          socket.ev.removeAllListeners('connection.update');
          socket.ev.removeAllListeners('creds.update');
          await auth.flush();
          await removeQR();
          const code = lastDisconnect?.error?.output?.statusCode;
          const permanent = [
            DisconnectReason.loggedOut,
            DisconnectReason.badSession,
            DisconnectReason.connectionReplaced,
            DisconnectReason.forbidden,
            DisconnectReason.multideviceMismatch,
          ].includes(code);
          if (permanent || ++retries > 5) {
            await stop(code === DisconnectReason.loggedOut ? 'logged_out' : 'disconnected');
            return;
          }
          await status('reconnecting', code);
          const delay = code === DisconnectReason.restartRequired ? 500 : Math.min(30000, 2000 * 2 ** (retries - 1));
          reconnect = schedule(() => {
            void enqueue(connect);
          }, delay);
        }
      });
    });
  }
  return { start: () => enqueue(connect), stop, flush: () => tasks };
}
