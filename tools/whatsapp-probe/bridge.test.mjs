import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { attemptLedger } from './attempt-ledger.mjs';
import { bridgeServer } from './bridge-http.mjs';
import { bridgeConnection } from './bridge-connection.mjs';
import { DisconnectReason } from 'baileys';

const message = () => ({ attemptId: randomUUID(), phoneE164: '+5491100000000', text: 'Fictitious test reminder' });
async function fixture(dispatch = async () => ({ state: 'accepted' })) {
  const directory = await mkdtemp(join(tmpdir(), 'calendary-bridge-'));
  const key = randomBytes(32),
    token = randomBytes(32).toString('base64url');
  const ledger = await attemptLedger(directory, key);
  let state = 'connected';
  const server = bridgeServer({ token, ledger, connection: () => ({ state }), dispatch });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    directory,
    key,
    ledger,
    url,
    token,
    state: (s) => {
      state = s;
    },
    async request(path, body, auth = token) {
      return fetch(`${url}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    },
    async close() {
      await new Promise((r) => {
        server.close(r);
        server.closeIdleConnections();
      });
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('authenticates status and sends once across concurrent requests and persisted restarts', async () => {
  let calls = 0,
    release;
  const waiting = new Promise((r) => {
    release = r;
  });
  const f = await fixture(async () => {
    calls++;
    await waiting;
    return { state: 'accepted' };
  });
  const input = message();
  try {
    assert.equal((await f.request('/status', undefined, 'wrong')).status, 401);
    assert.deepEqual(await (await f.request('/status')).json(), { state: 'connected', available: true });
    const first = f.request('/attempts', input);
    // Wait for the durable receipt, without contacting WhatsApp.
    while (!f.ledger.get(input.attemptId)) await new Promise((r) => setTimeout(r, 5));
    assert.equal((await (await f.request('/attempts', input)).json()).state, 'uncertain');
    const other = await (await f.request('/attempts', message())).json();
    assert.equal(other.state, 'not_accepted');
    assert.equal(other.retryable, true);
    release();
    const accepted = await (await first).json();
    assert.equal(accepted.state, 'accepted');
    assert.equal(calls, 1);
    assert.deepEqual(await (await f.request('/attempts', input)).json(), accepted);
    assert.equal((await f.request('/attempts', { ...input, text: 'different' })).status, 409);
    const restored = await attemptLedger(f.directory, f.key);
    assert.equal(restored.get(input.attemptId).state, 'accepted');
    const raw = await readFile(join(f.directory, 'attempts.enc'), 'utf8');
    assert(!raw.includes(input.phoneE164));
    assert(!raw.includes(input.text));
    assert(!raw.includes(input.attemptId));
    assert.equal(Object.values(restored.get(input.attemptId)).includes(input.text), false);
    assert.equal((await f.request(`/attempts/${input.attemptId}`)).status, 200);
  } finally {
    release();
    await f.close();
  }
});

test('recovers interrupted attempts as uncertain and refuses damaged or wrongly keyed storage', async () => {
  const f = await fixture(),
    input = message();
  try {
    await f.ledger.begin(input.attemptId, f.ledger.fingerprint(input), 'fictitious-id');
    const restored = await attemptLedger(f.directory, f.key);
    assert.equal(restored.get(input.attemptId).state, 'uncertain');
    assert.equal(await restored.begin(input.attemptId, 'other', 'other'), false);
    const raw = await readFile(join(f.directory, 'attempts.enc'));
    await assert.rejects(() => attemptLedger(f.directory, randomBytes(32)));
    assert.deepEqual(await readFile(join(f.directory, 'attempts.enc')), raw);
    await writeFile(join(f.directory, 'attempts.enc'), 'corrupt');
    await assert.rejects(() => attemptLedger(f.directory, f.key));
  } finally {
    await f.close();
  }
});

test('does not expose an accepted receipt when its final durable write failed', async () => {
  const f = await fixture(),
    input = message();
  try {
    await f.ledger.begin(input.attemptId, f.ledger.fingerprint(input), 'fictitious-id');
    const raw = await readFile(join(f.directory, 'attempts.enc'));
    await mkdir(join(f.directory, 'attempts.enc.tmp'));
    await assert.rejects(() => f.ledger.finish(input.attemptId, { state: 'accepted' }));
    assert.equal(f.ledger.get(input.attemptId).state, 'processing');
    assert.deepEqual(await readFile(join(f.directory, 'attempts.enc')), raw);
  } finally {
    await f.close();
  }
});

test('exposes only committed receipts while a final write is still pending or fails', async () => {
  for (const fail of [false, true]) {
    const directory = await mkdtemp(join(tmpdir(), 'calendary-durable-receipt-')),
      key = randomBytes(32),
      id = randomUUID();
    let calls = 0,
      release,
      entered;
    const started = new Promise((r) => {
        entered = r;
      }),
      waiting = new Promise((r) => {
        release = r;
      });
    try {
      const ledger = await attemptLedger(directory, key, 'attempts.enc', async (...args) => {
        if (++calls === 3) {
          entered();
          await waiting;
          if (fail) throw new Error('Fictitious failed commit');
        }
        await rename(...args);
      });
      await ledger.begin(id, 'opaque', 'message');
      const finishing = ledger.finish(id, { state: 'accepted' });
      const result = finishing.then(
        () => 'committed',
        () => 'failed'
      );
      await started;
      assert.equal(ledger.get(id).state, 'processing');
      release();
      assert.equal(await result, fail ? 'failed' : 'committed');
      assert.equal(ledger.get(id).state, fail ? 'processing' : 'accepted');
    } finally {
      release?.();
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test('maps unknown failures to uncertainty, rejection to non-retryable and avoids disconnected dispatch', async () => {
  for (const result of ['throw', { state: 'failed' }, { state: 'unrecognized' }]) {
    let calls = 0;
    const f = await fixture(async () => {
      calls++;
      if (result === 'throw') throw new Error('private-data');
      return result;
    });
    try {
      const input = message(),
        response = await (await f.request('/attempts', input)).json();
      assert.equal(response.state, result.state === 'failed' ? 'not_accepted' : 'uncertain');
      if (result.state === 'failed') assert.equal(response.retryable, false);
      assert(!JSON.stringify(response).includes('private-data'));
      await f.request('/attempts', input);
      assert.equal(calls, 1);
      f.state('disconnected');
      assert.equal((await (await f.request('/attempts', message())).json()).state, 'not_accepted');
      assert.equal(calls, 1);
      assert.equal((await f.request('/attempts', { ...message(), attemptId: '__proto__' })).status, 400);
      assert.equal((await f.request('/attempts', { ...message(), text: 'x'.repeat(9000) })).status, 413);
    } finally {
      await f.close();
    }
  }
});

test('transport connects with simulated socket, stops after logout and never handles inbound appointments', async () => {
  const socket = {
    ev: new EventEmitter(),
    ws: new EventEmitter(),
    end() {},
    sendMessage() {
      throw new Error('No send expected');
    },
  };
  let calls = 0;
  const auth = {
    state: { creds: { registered: true }, keys: { set: async () => {} } },
    saveCreds: async () => {},
    flush: async () => {},
  };
  const transport = bridgeConnection(auth, () => {
    calls++;
    return socket;
  });
  try {
    transport.start();
    socket.ev.emit('connection.update', { connection: 'open' });
    assert.equal(transport.status().state, 'connected');
    assert.equal(socket.ev.listenerCount('messages.upsert'), 0);
    socket.ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
    });
    assert.equal(transport.status().state, 'logged_out');
    assert.equal(calls, 1);
    assert.equal((await transport.dispatch(message())).state, 'failed');
  } finally {
    await transport.stop();
  }
  const unlinked = bridgeConnection({ state: { creds: {} } });
  unlinked.start();
  assert.equal(unlinked.status().state, 'unlinked');
});

test('a receipt write failure prevents dispatch or blind retries, including after accepted ACK', async () => {
  for (const operation of ['begin', 'finish']) {
    let calls = 0;
    const f = await fixture(async () => {
      calls++;
      return { state: 'accepted' };
    });
    try {
      f.ledger[operation] = async () => {
        throw new Error('fictitious storage failure');
      };
      const input = message();
      assert.equal((await f.request('/attempts', input)).status, 500);
      assert.equal(calls, operation === 'begin' ? 0 : 1);
      assert.deepEqual(await (await f.request('/status')).json(), { state: 'storage_error', available: false });
      await f.request('/attempts', input);
      await f.request('/attempts', message());
      assert.equal(calls, operation === 'begin' ? 0 : 1);
    } finally {
      await f.close();
    }
  }
});

test('reconnects transport after credentials flush without replaying a message', async () => {
  let reconnect,
    saves = 0,
    flushes = 0;
  const sockets = [];
  const auth = {
    state: { creds: { registered: true }, keys: { set: async () => {} } },
    saveCreds: async () => {
      saves++;
    },
    flush: async () => {
      flushes++;
    },
  };
  const transport = bridgeConnection(
    auth,
    (options) => {
      assert.equal(options.maxMsgRetryCount, 0);
      const socket = {
        ev: new EventEmitter(),
        ws: new EventEmitter(),
        end() {},
        sendMessage() {
          assert.fail('No replay allowed');
        },
      };
      sockets.push(socket);
      return socket;
    },
    (fn) => {
      reconnect = fn;
    }
  );
  try {
    transport.start();
    sockets[0].ev.emit('creds.update', {});
    sockets[0].ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired } } },
    });
    assert.equal(transport.status().state, 'reconnecting');
    reconnect();
    await new Promise((r) => setImmediate(r));
    assert.equal(sockets.length, 2);
    assert.equal(saves, 1);
    assert.equal(flushes, 1);
    sockets[1].ev.emit('connection.update', { connection: 'open' });
    sockets[0].ev.emit('connection.update', { connection: 'close' });
    assert.equal(transport.status().state, 'connected');
  } finally {
    await transport.stop();
  }
});
