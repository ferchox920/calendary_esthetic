import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { DisconnectReason } from 'baileys';
import { bridgeConnection } from './bridge-connection.mjs';
import { bridgeServer } from './bridge-http.mjs';
import { attemptLedger } from './attempt-ledger.mjs';
import { encryptedAuthStore } from './auth-store.mjs';

function transportFixture(registered = false) {
  let time = Date.now(),
    pairingCalls = 0,
    resets = 0,
    logouts = 0;
  const sockets = [],
    schedules = [];
  const auth = {
    state: { creds: { registered }, keys: { get: async () => ({}), set: async () => {} } },
    async saveCreds(update = {}) {
      Object.assign(auth.state.creds, update);
    },
    flush: async () => {},
    async reset() {
      resets++;
      auth.state.creds = { registered: false };
    },
  };
  const transport = bridgeConnection(
    auth,
    (options) => {
      const socket = {
        ev: new EventEmitter(),
        ws: new EventEmitter(),
        options,
        end() {},
        async requestPairingCode(phone, code) {
          assert.equal(phone, '5491100000000');
          pairingCalls++;
          return code;
        },
        async logout() {
          logouts++;
        },
        sendMessage() {
          assert.fail('Linking tests must not send');
        },
      };
      sockets.push(socket);
      return socket;
    },
    (fn, ms) => {
      schedules.push({ fn, ms });
    },
    () => time
  );
  return {
    transport,
    sockets,
    schedules,
    auth,
    advance: (ms) => {
      time += ms;
    },
    counts: () => ({ pairingCalls, resets, logouts }),
  };
}

test('links by code once, hides phone/material from status and expires with a clean retry', async () => {
  const f = transportFixture(),
    id = randomUUID();
  try {
    f.transport.start();
    assert.equal(f.sockets.length, 0);
    await f.transport.beginLink({ id, mode: 'code', phoneE164: '+5491100000000' });
    f.sockets[0].ev.emit('connection.update', { qr: 'fictitious-challenge' });
    await f.transport.flush();
    const challenge = f.transport.challenge(id);
    assert.match(challenge.code, /^\d{4}-\d{4}$/);
    assert.equal(challenge.state, 'ready');
    const safe = JSON.stringify(f.transport.status());
    assert(!safe.includes(challenge.code));
    assert(!safe.includes('5491100000000'));
    f.sockets[0].ev.emit('connection.update', { qr: 'refreshed' });
    await f.transport.flush();
    assert.equal(f.counts().pairingCalls, 1);
    await assert.rejects(
      () => f.transport.beginLink({ id: randomUUID(), mode: 'qr' }),
      (e) => e.controlCode === 'link_in_progress'
    );
    f.advance(120001);
    assert.equal(f.transport.challenge(id).state, 'expired');
    assert.equal(f.transport.challenge(id).code, undefined);
    await f.transport.beginLink({ id: randomUUID(), mode: 'qr' });
    assert.equal(f.counts().resets, 2);
  } finally {
    await f.transport.stop();
  }
});

test('refreshes QR, removes it at connection, refuses replacement of a linked account and blocks stale credentials', async () => {
  const f = transportFixture(),
    id = randomUUID();
  try {
    await f.transport.beginLink({ id, mode: 'qr' });
    f.sockets[0].ev.emit('connection.update', { qr: 'first-fictitious-qr' });
    await f.transport.flush();
    const first = f.transport.challenge(id).qrDataUrl;
    assert.match(first, /^data:image\/png;base64,/);
    f.advance(60001);
    assert.equal(f.transport.challenge(id).qrDataUrl, undefined);
    f.sockets[0].ev.emit('connection.update', { qr: 'second-fictitious-qr' });
    await f.transport.flush();
    assert.notEqual(f.transport.challenge(id).qrDataUrl, first);
    f.auth.state.creds.registered = true;
    f.sockets[0].ev.emit('connection.update', { connection: 'open' });
    await f.transport.flush();
    assert.equal(f.transport.challenge(id).state, 'connected');
    assert.equal(f.transport.challenge(id).qrDataUrl, undefined);
    await assert.rejects(
      () => f.transport.beginLink({ id: randomUUID(), mode: 'qr' }),
      (e) => e.controlCode === 'already_linked'
    );
    const result = await f.transport.disconnect();
    assert.equal(result.remoteLogout, 'requested');
    assert.equal(f.transport.status().linked, false);
    assert.equal(f.transport.status().state, 'unlinked');
    assert.equal(f.counts().logouts, 1);
    f.sockets[0].ev.emit('creds.update', { registered: true });
    await f.transport.flush();
    assert.equal(f.auth.state.creds.registered, false);
    await assert.rejects(() => f.sockets[0].options.auth.keys.set({ session: {} }));
  } finally {
    await f.transport.stop();
  }
});

test('a pairing restart reconnects without requesting another code, and logout failure remains unconfirmed', async () => {
  const f = transportFixture(),
    id = randomUUID();
  try {
    await f.transport.beginLink({ id, mode: 'code', phoneE164: '+5491100000000' });
    f.sockets[0].ev.emit('connection.update', { qr: 'first' });
    await f.transport.flush();
    f.auth.state.creds.registered = true;
    f.sockets[0].ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired } } },
    });
    f.schedules.find((x) => x.ms === 500).fn();
    await new Promise((r) => setImmediate(r));
    assert.equal(f.sockets.length, 2);
    assert.equal(f.counts().pairingCalls, 1);
    f.sockets[1].ev.emit('connection.update', { connection: 'open' });
    await f.transport.flush();
    f.sockets[1].logout = async () => {
      throw new Error('fictitious offline');
    };
    assert.equal((await f.transport.disconnect()).remoteLogout, 'unconfirmed');
    assert.equal(f.transport.status().linked, false);
  } finally {
    await f.transport.stop();
  }
});

test('never reveals a late code after connecting while requestPairingCode was pending', async () => {
  const f = transportFixture(),
    id = randomUUID();
  let release;
  try {
    await f.transport.beginLink({ id, mode: 'code', phoneE164: '+5491100000000' });
    f.sockets[0].requestPairingCode = () =>
      new Promise((r) => {
        release = r;
      });
    f.sockets[0].ev.emit('connection.update', { qr: 'first' });
    await new Promise((r) => setImmediate(r));
    f.auth.state.creds.registered = true;
    f.sockets[0].ev.emit('connection.update', { connection: 'open' });
    release('12345678');
    await f.transport.flush();
    assert.equal(f.transport.challenge(id).state, 'connected');
    assert.equal(f.transport.challenge(id).code, undefined);
  } finally {
    release?.('12345678');
    await f.transport.stop();
  }
});

test('an already scheduled reconnect cannot reopen a session after explicit disconnect', async () => {
  const f = transportFixture(true);
  let release;
  try {
    f.transport.start();
    f.sockets[0].ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired } } },
    });
    const waiting = new Promise((r) => {
      release = r;
    });
    f.auth.flush = async () => waiting;
    f.schedules.find((x) => x.ms === 500).fn();
    await new Promise((r) => setImmediate(r));
    const disconnecting = f.transport.disconnect();
    release();
    await disconnecting;
    await new Promise((r) => setImmediate(r));
    assert.equal(f.sockets.length, 1);
    assert.equal(f.transport.status().state, 'unlinked');
  } finally {
    release?.();
    await f.transport.stop();
  }
});

test('reset clears encrypted credentials/Signal keys while pairing code never persists', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'calendary-reset-')),
    key = randomBytes(32);
  try {
    const auth = await encryptedAuthStore(directory, key);
    await auth.saveCreds({ registered: true, pairingCode: '12345678' });
    await auth.state.keys.set({ session: { fictitious: Buffer.from([1, 2]) } });
    const restored = await encryptedAuthStore(directory, key);
    assert.equal(restored.state.creds.pairingCode, undefined);
    assert.equal(restored.state.creds.registered, true);
    await auth.reset();
    const unlinked = await encryptedAuthStore(directory, key);
    assert.equal(unlinked.state.creds.registered, false);
    assert.deepEqual(await unlinked.state.keys.get('session', ['fictitious']), {});
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('HTTP controls require authentication, persist receipts and never replay after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'calendary-control-')),
    key = randomBytes(32),
    token = randomBytes(32).toString('base64url');
  const controls = await attemptLedger(directory, key, 'controls.enc'),
    ledger = await attemptLedger(directory, key),
    f = transportFixture();
  let begins = 0,
    disconnects = 0;
  const manager = {
    ...f.transport,
    async beginLink(body) {
      begins++;
      return f.transport.beginLink(body);
    },
    async disconnect() {
      disconnects++;
      return f.transport.disconnect();
    },
  };
  const server = bridgeServer({
    token,
    controls,
    ledger,
    manager,
    connection: f.transport.status,
    dispatch: f.transport.dispatch,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = (path, body, auth = token) =>
    fetch(`${url}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  const command = { commandId: randomUUID(), action: 'link', mode: 'code', phoneE164: '+5491100000000' };
  try {
    assert.equal((await call('/controls', command, 'wrong')).status, 401);
    const first = await (await call('/controls', command)).json();
    assert.equal(first.state, 'completed');
    assert.equal(first.linkId, command.commandId);
    assert.deepEqual(await (await call('/controls', command)).json(), first);
    assert.equal(begins, 1);
    assert.equal((await call('/controls', { ...command, mode: 'qr', phoneE164: undefined })).status, 409);
    f.sockets[0].ev.emit('connection.update', { qr: 'fictitious' });
    await f.transport.flush();
    const challenge = await (await call(`/links/${first.linkId}`)).json();
    assert.match(challenge.code, /^\d{4}-\d{4}$/);
    assert.equal((await call(`/links/${first.linkId}`, undefined, 'wrong')).status, 401);
    assert(!JSON.stringify(await (await call('/status')).json()).includes(challenge.code));
    const receipt = await (await call(`/controls/${command.commandId}`)).json();
    assert(!JSON.stringify(receipt).includes(challenge.code));
    const interrupted = randomUUID();
    await controls.begin(interrupted, 'fictitious', null);
    const restart = await attemptLedger(directory, key, 'controls.enc');
    assert.equal(restart.get(interrupted).state, 'uncertain');
    assert.equal(restart.get(command.commandId).state, 'completed');
    const raw = await readFile(join(directory, 'controls.enc'), 'utf8');
    assert(!raw.includes(command.phoneE164));
    assert(!raw.includes(challenge.code));
    const disconnect = { commandId: randomUUID(), action: 'disconnect' };
    assert.equal((await (await call('/controls', disconnect)).json()).state, 'completed');
    await call('/controls', disconnect);
    assert.equal(disconnects, 1);
    assert.equal(
      (await call('/controls', { commandId: randomUUID(), action: 'reconnect', phoneE164: command.phoneE164 })).status,
      400
    );
  } finally {
    await new Promise((r) => {
      server.close(r);
      server.closeIdleConnections();
    });
    await f.transport.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('serializes lifecycle controls with sends without interrupting or starting messages during logout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'calendary-control-send-')),
    key = randomBytes(32),
    token = randomBytes(32).toString('base64url');
  const controls = await attemptLedger(directory, key, 'controls.enc'),
    ledger = await attemptLedger(directory, key);
  let sent = 0,
    disconnected = 0,
    releaseSend,
    releaseControl;
  const sendWaiting = new Promise((r) => {
      releaseSend = r;
    }),
    controlWaiting = new Promise((r) => {
      releaseControl = r;
    });
  const server = bridgeServer({
    token,
    controls,
    ledger,
    connection: () => ({ state: 'connected', linked: true, link: null }),
    manager: {
      async disconnect() {
        disconnected++;
        await controlWaiting;
        return { remoteLogout: 'requested' };
      },
    },
    async dispatch() {
      sent++;
      await sendWaiting;
      return { state: 'accepted' };
    },
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = (path, body) =>
    fetch(`${url}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    const send = call('/attempts', { attemptId: randomUUID(), phoneE164: '+5491100000000', text: 'Fictitious' });
    while (sent === 0) await new Promise((r) => setTimeout(r, 5));
    const blocked = { commandId: randomUUID(), action: 'disconnect' };
    assert.equal((await (await call('/controls', blocked)).json()).reason, 'busy');
    assert.equal(disconnected, 0);
    releaseSend();
    assert.equal((await (await send).json()).state, 'accepted');
    await call('/controls', blocked);
    assert.equal(disconnected, 0);
    const control = call('/controls', { commandId: randomUUID(), action: 'disconnect' });
    while (disconnected === 0) await new Promise((r) => setTimeout(r, 5));
    assert.equal((await (await call('/status')).json()).available, false);
    assert.equal(
      (
        await (
          await call('/attempts', { attemptId: randomUUID(), phoneE164: '+5491100000000', text: 'Fictitious' })
        ).json()
      ).state,
      'not_accepted'
    );
    assert.equal(sent, 1);
    releaseControl();
    assert.equal((await (await control).json()).state, 'completed');
  } finally {
    releaseSend();
    releaseControl();
    await new Promise((r) => {
      server.close(r);
      server.closeIdleConnections();
    });
    await rm(directory, { recursive: true, force: true });
  }
});
