import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export async function attemptLedger(directory, key, file = 'attempts.enc', commit = rename) {
  if (!['attempts.enc', 'controls.enc'].includes(file)) throw new Error('Invalid ledger');
  const aad = Buffer.from(
    file === 'attempts.enc' ? 'calendary:whatsapp-attempt-ledger:v1' : 'calendary:whatsapp-controls:v1'
  );
  const path = join(directory, file);
  let records = {},
    durable = {},
    pending = Promise.resolve();
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    if (data.version !== 1) throw new Error('version');
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'base64'));
    cipher.setAAD(aad);
    cipher.setAuthTag(Buffer.from(data.tag, 'base64'));
    records = JSON.parse(
      Buffer.concat([cipher.update(Buffer.from(data.content, 'base64')), cipher.final()]).toString()
    );
    if (!records || Array.isArray(records) || typeof records !== 'object') throw new Error('shape');
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Error('Attempt storage unavailable');
  }
  async function persist() {
    const snapshot = JSON.stringify(records);
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const content = Buffer.concat([cipher.update(snapshot), cipher.final()]);
    const handle = await open(`${path}.tmp`, 'w', 0o600);
    try {
      await handle.writeFile(
        JSON.stringify({
          version: 1,
          iv: iv.toString('base64'),
          tag: cipher.getAuthTag().toString('base64'),
          content: content.toString('base64'),
        })
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
    await commit(`${path}.tmp`, path);
    durable = JSON.parse(snapshot);
  }
  // An interrupted dispatch is never eligible for a second call to WhatsApp.
  for (const record of Object.values(records))
    if (record.state === 'processing') {
      record.state = 'uncertain';
      record.reason = 'service_interrupted';
    }
  await persist();
  const serial = (action) => {
    const task = pending.then(action);
    pending = task.catch(() => {});
    return task;
  };
  return {
    fingerprint(message) {
      return createHmac('sha256', key)
        .update(JSON.stringify([message.phoneE164, message.text]))
        .digest('hex');
    },
    get(id) {
      return durable[id] ? { ...durable[id] } : undefined;
    },
    begin(id, fingerprint, messageId) {
      return serial(async () => {
        if (records[id]) return false;
        // No automatic pruning: deleting receipts could permit duplicate sends.
        if (Object.keys(records).length >= 10000) throw new Error('Attempt storage capacity reached');
        records[id] = { fingerprint, messageId, state: 'processing', startedAt: new Date().toISOString() };
        await persist();
        return true;
      });
    },
    finish(id, result) {
      return serial(async () => {
        const before = { ...records[id] };
        Object.assign(records[id], result, { finishedAt: new Date().toISOString() });
        try {
          await persist();
        } catch (error) {
          records[id] = before;
          throw error;
        }
      });
    },
  };
}
