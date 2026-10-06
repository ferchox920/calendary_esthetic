import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../../.local/whatsapp-probe/stop.request', import.meta.url));
await writeFile(file, 'stop', { mode: 0o600 });
console.log('Solicitada la detención de la prueba local');
