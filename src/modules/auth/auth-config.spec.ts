import { authConfig } from './auth-config';
import { sanitizeResponse } from './private-response.interceptor';

describe('Private authentication configuration', () => {
  const env = { JWT_SECRET: 'fictitious-unit-secret-with-at-least-32-bytes', JWT_EXPIRATION_TIME: '1h' };
  it('uses a single signing secret and computes 1h as 3600 seconds', () => {
    expect(authConfig(env).jwt.secret).toBe(env.JWT_SECRET);
    expect(authConfig(env).seconds).toBe(3600);
    expect(authConfig(env).cookie).toMatchObject({ httpOnly: true, sameSite: 'strict' });
  });
  it.each(['', 'short'])('rejects weak secret %s', (secret) => {
    expect(() => authConfig({ ...env, JWT_SECRET: secret })).toThrow();
  });
  it.each(['0s', '25h', 'abc', '1', '-1h'])('rejects invalid duration %s', (duration) => {
    expect(() => authConfig({ ...env, JWT_EXPIRATION_TIME: duration })).toThrow();
  });
  it('requires HTTPS in production and sets secure cookies', () => {
    expect(() => authConfig({ ...env, NODE_ENV: 'production' })).toThrow();
    expect(
      authConfig({ ...env, NODE_ENV: 'production', APP_ORIGIN: 'https://agenda.example.test' }).cookie.secure
    ).toBe(true);
  });
  it('removes secrets in nested plain objects as well as entity instances', () => {
    expect(
      sanitizeResponse({
        password: 'fake',
        relations: [{ otp: 'fake', passwordHash: 'fake', sessionVersion: 3, name: 'Demo' }],
      })
    ).toEqual({ relations: [{ name: 'Demo' }] });
  });
});
