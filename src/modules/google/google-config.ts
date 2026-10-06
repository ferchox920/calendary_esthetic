import { ServiceUnavailableException } from '@nestjs/common';
import { authConfig } from '../auth/auth-config';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export const GOOGLE_STATE_COOKIE = 'agenda_google_state';
export const GOOGLE_CALLBACK_PATH = '/api/v1/auth/google/callback';

export function googleConfig(env: NodeJS.ProcessEnv = process.env, requireEnabled = true) {
  for (const field of ['GOOGLE_ENABLED', 'GOOGLE_SYNC_WORKER_ENABLED']) {
    if (env[field] !== undefined && !['true', 'false'].includes(env[field]))
      throw new Error(`${field} must be true or false`);
  }
  const enabled = env.GOOGLE_ENABLED === 'true';
  if (!enabled && requireEnabled)
    throw new ServiceUnavailableException('La integración con Google todavía no está configurada');
  if (!enabled)
    return {
      enabled,
      workerEnabled: false,
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      encryptionKey: Buffer.alloc(0),
    };
  const clientId = env.GOOGLE_CLIENT_ID?.trim(),
    clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const encodedKey = env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() || '';
  const encryptionKey = Buffer.from(encodedKey, 'base64');
  const redirectUri = env.GOOGLE_REDIRECT_URI || `${authConfig(env).origin}${GOOGLE_CALLBACK_PATH}`;
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    throw new Error('GOOGLE_REDIRECT_URI invalid');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !clientId?.endsWith('.apps.googleusercontent.com') ||
    !clientSecret ||
    encryptionKey.toString('base64') !== encodedKey ||
    encryptionKey.length !== 32 ||
    !['http:', 'https:'].includes(url.protocol) ||
    (url.protocol === 'http:' && !local) ||
    (authConfig(env).production && url.protocol !== 'https:') ||
    url.pathname !== GOOGLE_CALLBACK_PATH ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error('Google OAuth configuration is incomplete or invalid');
  }
  return {
    enabled,
    clientId,
    clientSecret,
    redirectUri,
    encryptionKey,
    workerEnabled: env.GOOGLE_SYNC_WORKER_ENABLED !== 'false' && env.NODE_ENV !== 'test',
  };
}
