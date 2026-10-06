import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { sendWithAck } from './send-once.mjs';

function mockSocket(send) {
  return { ws: new EventEmitter(), ev: new EventEmitter(), sendMessage: send };
}
const payload = { phoneE164: '+5491100000000', text: 'Fictitious test only', messageId: 'FICTITIOUS-ID' };
test('requires an acknowledgement correlated with the outgoing message', async () => {
  let calls = 0;
  const socket = mockSocket(async (jid, content, options) => {
    calls++;
    assert.equal(jid, '5491100000000@s.whatsapp.net');
    assert.deepEqual(content, { text: payload.text });
    socket.ws.emit('CB:ack,class:message', { attrs: { id: 'OTHER' } });
    setTimeout(() => socket.ws.emit('CB:ack,class:message', { attrs: { id: options.messageId } }), 5);
    return { key: { id: options.messageId } };
  });
  assert.deepEqual(await sendWithAck(socket, payload), { state: 'accepted', reason: 'server_ack' });
  assert.equal(calls, 1);
  assert.equal(socket.ws.listenerCount('CB:ack,class:message'), 0);
});
test('does not equate a successful sendMessage call with server acknowledgement and never retries', async () => {
  let calls = 0;
  const socket = mockSocket(async () => {
    calls++;
    return { key: { id: payload.messageId } };
  });
  assert.deepEqual(await sendWithAck(socket, { ...payload, timeoutMs: 10 }), {
    state: 'uncertain',
    reason: 'ack_timeout',
  });
  assert.equal(calls, 1);
});
test('records rejection, disconnection and unknown failures without exposing their contents', async () => {
  const rejected = mockSocket(async () => {
    rejected.ws.emit('CB:ack,class:message', { attrs: { id: payload.messageId, error: '400' } });
  });
  assert.deepEqual(await sendWithAck(rejected, payload), { state: 'failed', reason: 'server_rejected' });
  const disconnected = mockSocket(async () => {
    disconnected.ev.emit('connection.update', { connection: 'close' });
  });
  assert.deepEqual(await sendWithAck(disconnected, payload), { state: 'uncertain', reason: 'connection_lost' });
  const unknown = mockSocket(async () => {
    throw new Error('Private message contents must never be returned');
  });
  assert.deepEqual(await sendWithAck(unknown, payload), { state: 'uncertain', reason: 'send_result_unknown' });
});
