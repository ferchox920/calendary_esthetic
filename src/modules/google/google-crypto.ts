import { ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { googleConfig } from './google-config';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function encrypt(value: string, context: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', googleConfig().encryptionKey, iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(
    '.'
  );
}

export function decrypt(value: string, context: string): string {
  try {
    const [version, iv, tag, data, extra] = value.split('.');
    if (version !== 'v1' || extra || !iv || !tag || !data) throw new Error('Invalid encrypted record');
    const decipher = createDecipheriv('aes-256-gcm', googleConfig().encryptionKey, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new ServiceUnavailableException('No se pudieron abrir las credenciales de Google');
  }
}
