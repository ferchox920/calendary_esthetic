import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { DisconnectReason } from 'baileys';
import { encryptedAuthStore, windowsKey } from './auth-store.mjs';
import { createProbe, probeLock } from './probe.mjs';

test('persists credentials and Signal keys encrypted, with binary round-trip and key deletion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'calendary-auth-test-'));
  try {
    const key = randomBytes(32),
      store = await encryptedAuthStore(directory, key);
    await store.saveCreds({ testSentinel: 'private-fictitious-auth-data' });
    await Promise.all([
      store.state.keys.set({ session: { demo: Buffer.from([1, 2, 3]) } }),
      store.state.keys.set({ 'pre-key': { demo: { private: Buffer.from([4, 5, 6]) } } }),
    ]);
    const disk = await readFile(join(directory, 'auth.enc'), 'utf8');
    assert(!disk.includes('private-fictitious-auth-data'));
    assert(!disk.includes('noiseKey'));
    const restored = await encryptedAuthStore(directory, key);
    assert.equal(restored.state.creds.testSentinel, 'private-fictitious-auth-data');
    assert.deepEqual((await restored.state.keys.get('session', ['demo'])).demo, Buffer.from([1, 2, 3]));
    assert.deepEqual((await restored.state.keys.get('pre-key', ['demo'])).demo.private, Buffer.from([4, 5, 6]));
    await restored.state.keys.set({ session: { demo: null } });
    assert.deepEqual(await (await encryptedAuthStore(directory, key)).state.keys.get('session', ['demo']), {});
    const before = await readFile(join(directory, 'auth.enc'));
    await assert.rejects(() => encryptedAuthStore(directory, randomBytes(32)), /No se pudo descifrar/);
    assert.deepEqual(await readFile(join(directory, 'auth.enc')), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  'protects and restores the independent encryption key using Windows DPAPI',
  { skip: process.platform !== 'win32' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'calendary-dpapi-test-'));
    try {
      const key = await windowsKey(directory),
        restored = await windowsKey(directory);
      assert.equal(key.length, 32);
      assert.deepEqual(restored, key);
      assert.notEqual(await readFile(join(directory, 'key.dpapi'), 'utf8'), key.toString('base64'));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test('refuses concurrent use of the same session and releases only its own lock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'calendary-lock-test-'));
  try {
    const release = await probeLock(directory);
    await assert.rejects(() => probeLock(directory), /ya está ejecutándose/);
    await release();
    const second = await probeLock(directory);
    await second();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('renders QR privately, persists on open, never sends/replies and handles the expected pairing restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'calendary-link-test-'));
  const sockets = [],
    statuses = [],
    scheduled = [];
  let saves = 0;
  const makeSocket = (options) => {
    assert.equal(options.markOnlineOnConnect, false);
    assert.equal(options.shouldSyncHistoryMessage({}), false);
    const socket = {
      ev: new EventEmitter(),
      end() {},
      sendMessage() {
        throw new Error('Tests must never send');
      },
    };
    sockets.push(socket);
    return socket;
  };
  const probe = createProbe({
    directory,
    makeSocket,
    auth: {
      state: {},
      saveCreds: async () => {
        saves++;
      },
      flush: async () => {},
    },
    onStatus: (state) => statuses.push(state),
    schedule: (callback, delay) => {
      scheduled.push({ callback, delay });
    },
  });
  try {
    await probe.start();
    sockets[0].ev.emit('connection.update', { qr: 'fictitious-qr-challenge' });
    await probe.flush();
    await access(join(directory, 'qr.png'));
    assert.equal(statuses.at(-1).state, 'qr_ready');
    sockets[0].ev.emit('creds.update', { registered: true });
    await probe.flush();
    assert.equal(saves, 1);
    sockets[0].ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired }, secret: 'never-log' } },
    });
    await probe.flush();
    assert.equal(statuses.at(-1).state, 'reconnecting');
    assert.equal(scheduled[0].delay, 500);
    scheduled[0].callback();
    await probe.flush();
    assert.equal(sockets.length, 2);
    sockets[1].ev.emit('connection.update', { connection: 'open' });
    await probe.flush();
    assert.equal(statuses.at(-1).state, 'connected');
    assert.equal(saves, 2);
    await assert.rejects(() => access(join(directory, 'qr.png')));
    for (const socket of sockets) assert.equal(socket.ev.listenerCount('messages.upsert'), 0);
    assert(!JSON.stringify(statuses).includes('never-log'));
    assert(statuses.every((s) => s.sendEnabled === false));
  } finally {
    await probe.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('stops reconnecting after logout without overwriting or deleting the stored session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'calendary-logout-test-'));
  const socket = { ev: new EventEmitter(), end() {} };
  const statuses = [];
  let schedules = 0;
  const probe = createProbe({
    directory,
    makeSocket: () => socket,
    auth: { state: {}, saveCreds: async () => {}, flush: async () => {} },
    onStatus: (s) => statuses.push(s),
    schedule: () => {
      schedules++;
    },
  });
  try {
    await probe.start();
    socket.ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
    });
    await probe.flush();
    assert.equal(statuses.at(-1).state, 'logged_out');
    assert.equal(schedules, 0);
  } finally {
    await probe.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('requests a numeric code once, without rendering QR or logging the destination', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'calendary-code-test-'));
  const statuses = [],
    calls = [];
  let saves = 0;
  const socket = {
    ev: new EventEmitter(),
    end() {},
    async requestPairingCode(phone, custom) {
      calls.push({ phone, custom });
      return custom;
    },
  };
  const probe = createProbe({
    directory,
    phoneNumber: '5491100000000',
    makeSocket: () => socket,
    auth: {
      state: { creds: { registered: false } },
      saveCreds: async () => {
        saves++;
      },
      flush: async () => {},
    },
    onStatus: (s) => statuses.push(s),
  });
  try {
    await probe.start();
    socket.ev.emit('connection.update', { qr: 'fictitious-qr' });
    await probe.flush();
    socket.ev.emit('connection.update', { qr: 'fictitious-next-qr' });
    await probe.flush();
    assert.equal(calls.length, 1);
    assert.match(calls[0].custom, /^\d{8}$/);
    assert.equal(saves, 1);
    assert.match(await readFile(join(directory, 'pairing-code.txt'), 'utf8'), /^\d{4}-\d{4}\n$/);
    assert.equal(statuses.at(-1).state, 'code_ready');
    assert(!JSON.stringify(statuses).includes('5491100000000'));
    await assert.rejects(() => access(join(directory, 'qr.png')));
    await probe.stop();
    await assert.rejects(() => access(join(directory, 'pairing-code.txt')));
  } finally {
    await probe.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
