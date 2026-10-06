import { fileURLToPath } from 'node:url';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { windowsKey, encryptedAuthStore } from './auth-store.mjs';
import { createProbe, probeLock } from './probe.mjs';

// Independent of Nest, PostgreSQL and reminder workers. Never reads the application's .env.
const directory = fileURLToPath(new URL('../../.local/whatsapp-probe/', import.meta.url));
let unlock, probe, lifetime, control;
async function finish() {
  if (lifetime) clearTimeout(lifetime);
  if (control) clearInterval(control);
  try {
    await probe?.stop();
  } finally {
    await unlock?.();
  }
}
try {
  const key = await windowsKey(directory);
  unlock = await probeLock(directory);
  const auth = await encryptedAuthStore(directory, key);
  let exiting = false;
  async function exit() {
    if (exiting) return;
    exiting = true;
    await finish();
    process.exit(0);
  }
  process.once('SIGINT', () => {
    void exit();
  });
  process.once('SIGTERM', () => {
    void exit();
  });
  const stopPath = join(directory, 'stop.request');
  try {
    await unlink(stopPath);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  control = setInterval(() => {
    void readFile(stopPath)
      .then(() => exit())
      .catch(() => {});
  }, 500);
  lifetime = setTimeout(
    () => {
      void exit();
    },
    10 * 60 * 1000
  );
  let phoneNumber;
  if (process.argv.includes('--code') && !auth.state.creds.registered) {
    const phonePath = join(directory, 'input-phone.txt');
    try {
      await writeFile(phonePath, '', { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    console.log('WhatsApp link test: phone_required; edit the private input-phone.txt file; sending disabled');
    while (!exiting && !phoneNumber) {
      const input = (await readFile(phonePath, 'utf8')).trim().replace(/^\+/, '');
      if (/^[1-9]\d{7,14}$/.test(input)) {
        phoneNumber = input;
        await unlink(phonePath);
      } else await pause(500);
    }
    if (exiting) process.exit(0);
  }
  probe = createProbe({
    directory,
    auth,
    phoneNumber,
    onStatus: ({ state }) => console.log(`WhatsApp link test: ${state}; sending disabled`),
  });
  await probe.start();
} catch {
  console.error('La prueba no pudo iniciarse. No se muestran credenciales ni datos de WhatsApp.');
  await finish();
  process.exitCode = 1;
}
