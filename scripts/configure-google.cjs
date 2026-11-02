// Import the downloaded Google Cloud web-client JSON without printing credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

function configure() {
  const input = process.argv[2];
  if (!input) throw new Error('Uso: node scripts/configure-google.cjs <ruta-al-json-oauth>');
  const client = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8')).web;
  const callback = 'http://127.0.0.1:3000/api/v1/auth/google/callback';
  if (!client || client.project_id !== 'agenda-gabriela-2026' || typeof client.client_id !== 'string' ||
    !client.client_id.endsWith('.apps.googleusercontent.com') || typeof client.client_secret !== 'string' ||
    !client.client_secret.trim() || !client.redirect_uris?.includes(callback) ||
    /[\r\n]/.test(client.client_id + client.client_secret)) {
    throw new Error('El JSON debe ser un cliente web del proyecto agenda-gabriela-2026 con el callback local configurado');
  }
  const envPath = path.resolve(__dirname, '../.env');
  const original = fs.readFileSync(envPath, 'utf8');
  const values = dotenv.parse(original);
  const encryptionKey = values.GOOGLE_TOKEN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
  if (Buffer.from(encryptionKey, 'base64').length !== 32 || Buffer.from(encryptionKey, 'base64').toString('base64') !== encryptionKey) {
    throw new Error('La clave de cifrado existente es inválida; no se reemplazó ni se modificó el archivo');
  }
  const updates = {
    GOOGLE_ENABLED: 'true', GOOGLE_CLIENT_ID: client.client_id,
    GOOGLE_CLIENT_SECRET: client.client_secret, GOOGLE_REDIRECT_URI: callback,
    GOOGLE_TOKEN_ENCRYPTION_KEY: encryptionKey, GOOGLE_SYNC_WORKER_ENABLED: 'true',
  };
  const remaining = new Set(Object.keys(updates));
  const lines = original.split(/\r?\n/).map(line => {
    const match = /^([A-Z_]+)\s*=/.exec(line);
    if (!match || !Object.hasOwn(updates, match[1])) return line;
    remaining.delete(match[1]);
    return `${match[1]}=${JSON.stringify(updates[match[1]])}`;
  });
  for (const key of remaining) lines.push(`${key}=${JSON.stringify(updates[key])}`);
  fs.writeFileSync(envPath, lines.join(original.includes('\r\n') ? '\r\n' : '\n'), { mode: 0o600 });
  console.log('Google OAuth configurado en el .env privado. Reiniciá la API y conectá la cuenta desde Configuración.');
}
try { configure(); } catch { console.error('No se pudo importar OAuth. Verificá la ruta, el cliente web, el proyecto, el callback y la clave de cifrado. No se muestran credenciales.'); process.exitCode = 1; }
