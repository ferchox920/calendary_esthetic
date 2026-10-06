import { JwtModuleOptions } from '@nestjs/jwt';
import { CookieOptions } from 'express';

export function authConfig(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes');
  }
  const duration = env.JWT_EXPIRATION_TIME || '1h';
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) throw new Error('JWT_EXPIRATION_TIME must use s, m, h or d');
  const seconds = Number(match[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) {
    throw new Error('JWT_EXPIRATION_TIME must be between 1 second and 1 day');
  }
  const origin = env.APP_ORIGIN || 'http://127.0.0.1:3000';
  const url = new URL(origin);
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without a trailing slash');
  }
  const production = env.NODE_ENV === 'production';
  if (production && url.protocol !== 'https:') throw new Error('APP_ORIGIN must use HTTPS in production');
  const cookie: CookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: 'strict',
    path: '/api/v1',
  };
  const jwt: JwtModuleOptions = {
    secret,
    signOptions: { algorithm: 'HS256', expiresIn: seconds, issuer: 'calendary-esthetic', audience: 'gabriela-agenda' },
  };
  return { jwt, cookie, seconds, origin, production, cookieName: 'agenda_session' };
}
