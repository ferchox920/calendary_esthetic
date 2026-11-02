import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Some libsignal versions dump keys with console. Only emit our own static lifecycle states.
for (const method of ['log', 'info', 'warn', 'error', 'debug']) console[method] = () => {};
const report = (state) => process.stdout.write(`${JSON.stringify({ service: 'whatsapp-bridge', state })}\n`);
let shutdown;
async function main() {
  const [{ windowsKey, encryptedAuthStore }, { probeLock }, { attemptLedger }, { bridgeServer }, { bridgeConnection }] =
    await Promise.all([
      import('./auth-store.mjs'),
      import('./probe.mjs'),
      import('./attempt-ledger.mjs'),
      import('./bridge-http.mjs'),
      import('./bridge-connection.mjs'),
    ]);
  const directory = fileURLToPath(new URL('../../.local/whatsapp-probe/', import.meta.url));
  const port = Number(process.env.WHATSAPP_BRIDGE_PORT || 3011);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
  const key = await windowsKey(directory),
    unlock = await probeLock(directory);
  let connection, server;
  try {
    let token;
    const tokenPath = join(directory, 'bridge-token.txt');
    try {
      token = (await readFile(tokenPath, 'utf8')).trim();
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      token = randomBytes(32).toString('base64url');
      await writeFile(tokenPath, token, { flag: 'wx', mode: 0o600 });
    }
    const auth = await encryptedAuthStore(directory, key);
    const ledger = await attemptLedger(directory, key);
    const controls = await attemptLedger(directory, key, 'controls.enc');
    connection = bridgeConnection(auth);
    server = bridgeServer({
      token,
      ledger,
      controls,
      manager: connection,
      connection: connection.status,
      dispatch: connection.dispatch,
    });
    let closing = false;
    shutdown = async () => {
      if (closing) return;
      closing = true;
      // Stop accepting requests, drain the bounded in-flight send, then release the session.
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeIdleConnections();
      });
      try {
        await connection.stop();
      } finally {
        await unlock();
      }
      report('stopped');
    };
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    server.on('error', () => {
      void shutdown().finally(() => process.exit(1));
    });
    connection.start();
    report('started');
  } catch {
    server?.close();
    try {
      await connection?.stop();
    } finally {
      await unlock();
    }
    throw new Error('Bridge startup failed');
  }
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void shutdown?.()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
main().catch(() => {
  report('startup_failed');
  process.exit(1);
});
