import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { BufferJSON, initAuthCreds, proto } from 'baileys';

const aad = Buffer.from('calendary_esthetic:whatsapp-link-probe:v1');
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}
function run(executable, args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(executable, args, { windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) reject(new Error('No se pudo proteger el almacenamiento local'));
      else resolve(stdout.trim());
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
export async function windowsKey(directory) {
  if (process.platform !== 'win32') throw new Error('Esta prueba requiere la protección de Windows');
  await mkdir(directory, { recursive: true });
  const sid = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
  ]);
  await run('icacls.exe', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`]);
  const path = join(directory, 'key.dpapi');
  const prefix = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd());
    $e=[Text.Encoding]::UTF8.GetBytes('calendary_esthetic:whatsapp-link-probe:v1');`;
  if (!(await exists(path))) {
    if (await exists(join(directory, 'auth.enc')))
      throw new Error('Falta la clave protegida; se conserva la sesión existente');
    const secret = randomBytes(32);
    const protectedKey = await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `${prefix}
      [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser))`,
      ],
      secret.toString('base64')
    );
    await writeFile(path, protectedKey, { flag: 'wx', mode: 0o600 });
    return secret;
  }
  const key = await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `${prefix}
    [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser))`,
    ],
    await readFile(path, 'utf8')
  );
  const decoded = Buffer.from(key, 'base64');
  if (decoded.length !== 32) throw new Error('Clave protegida inválida');
  return decoded;
}

export async function encryptedAuthStore(directory, key) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'auth.enc');
  let content = { creds: initAuthCreds(), keys: {} };
  if (await exists(path)) {
    try {
      const envelope = JSON.parse(await readFile(path, 'utf8'));
      if (envelope.version !== 1) throw new Error('version');
      const decrypt = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
      decrypt.setAAD(aad);
      decrypt.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      content = JSON.parse(
        Buffer.concat([decrypt.update(Buffer.from(envelope.ciphertext, 'base64')), decrypt.final()]).toString('utf8'),
        BufferJSON.reviver
      );
      if (!content.creds?.noiseKey || !content.keys) throw new Error('structure');
    } catch {
      throw new Error('No se pudo descifrar la sesión; no se sobrescribió');
    }
  }
  let writes = Promise.resolve();
  let failure;
  function save() {
    writes = writes.then(async () => {
      if (failure) throw failure;
      try {
        const iv = randomBytes(12),
          cipher = createCipheriv('aes-256-gcm', key, iv);
        cipher.setAAD(aad);
        const ciphertext = Buffer.concat([
          cipher.update(JSON.stringify(content, BufferJSON.replacer), 'utf8'),
          cipher.final(),
        ]);
        const temp = join(directory, 'auth.tmp');
        await writeFile(
          temp,
          JSON.stringify({
            version: 1,
            iv: iv.toString('base64'),
            tag: cipher.getAuthTag().toString('base64'),
            ciphertext: ciphertext.toString('base64'),
          }),
          { mode: 0o600 }
        );
        await rename(temp, path);
      } catch {
        failure = new Error('No se pudo guardar la sesión cifrada');
        throw failure;
      }
    });
    return writes;
  }
  const state = {
    creds: content.creds,
    keys: {
      async get(type, ids) {
        const result = {};
        for (const id of ids) {
          let value = content.keys[type]?.[id];
          if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
          if (value) result[id] = value;
        }
        return result;
      },
      async set(data) {
        for (const [type, values] of Object.entries(data)) {
          content.keys[type] ??= {};
          for (const [id, value] of Object.entries(values)) {
            if (value === null || value === undefined) delete content.keys[type][id];
            else content.keys[type][id] = value;
          }
        }
        await save();
      },
    },
  };
  return {
    state,
    async saveCreds(update = {}) {
      Object.assign(content.creds, update);
      await save();
    },
    async flush() {
      await writes;
    },
  };
}
