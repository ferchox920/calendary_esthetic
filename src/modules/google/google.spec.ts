import { LoginTicket, OAuth2Client, TokenPayload } from 'google-auth-library';
import { googleConfig } from './google-config';
import { decrypt, encrypt } from './google-crypto';
import { GoogleGateway, GoogleProviderError } from './google.gateway';
import { googleEvent, googleEventId } from './google-outbox';

describe('Google configuration, encrypted credentials and gateway', () => {
  const variables = [
    'GOOGLE_ENABLED',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'GOOGLE_TOKEN_ENCRYPTION_KEY',
    'GOOGLE_SYNC_WORKER_ENABLED',
    'JWT_SECRET',
    'APP_ORIGIN',
    'NODE_ENV',
  ];
  const prior = Object.fromEntries(variables.map((k) => [k, process.env[k]]));
  const settings = {
    GOOGLE_ENABLED: 'true',
    GOOGLE_CLIENT_ID: 'demo.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'fictitious-secret',
    GOOGLE_REDIRECT_URI: 'http://127.0.0.1:3000/api/v1/auth/google/callback',
    GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 42).toString('base64'),
    GOOGLE_SYNC_WORKER_ENABLED: 'false',
    JWT_SECRET: 'unit-test-only-jwt-secret-at-least-32-bytes',
    APP_ORIGIN: 'http://127.0.0.1:3000',
    NODE_ENV: 'test',
  };
  const gateway = new GoogleGateway();
  const entry = {
    id: '12345678-1234-4234-9234-123456789abc',
    kind: 'session',
    sessionStatus: 'pending',
    version: 2,
    startAt: '2035-06-11T13:00:00Z',
    endAt: '2035-06-11T14:00:00Z',
    prepMinutes: 15,
    cleanupMinutes: 15,
  };
  const body = () => googleEvent(entry, 'America/Argentina/Buenos_Aires', 3);
  const remote = (entryVersion = 1, settingsVersion = 1) => ({
    etag: '"remote-etag"',
    extendedProperties: {
      private: {
        agendaEntryId: entry.id,
        agendaEntryVersion: String(entryVersion),
        agendaSettingsVersion: String(settingsVersion),
      },
    },
  });

  beforeEach(() => Object.assign(process.env, settings));
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    for (const key of variables) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  });

  it('is disabled by default and rejects invalid secrets or nonlocal HTTP callbacks', () => {
    expect(googleConfig({ GOOGLE_ENABLED: 'false' }, false).enabled).toBe(false);
    expect(() => googleConfig({ GOOGLE_ENABLED: 'false' })).toThrow('todavía no está configurada');
    expect(() => googleConfig({ ...settings, GOOGLE_TOKEN_ENCRYPTION_KEY: 'short' })).toThrow();
    expect(() =>
      googleConfig({ ...settings, GOOGLE_TOKEN_ENCRYPTION_KEY: settings.GOOGLE_TOKEN_ENCRYPTION_KEY + '!' })
    ).toThrow();
    expect(() =>
      googleConfig({ ...settings, GOOGLE_REDIRECT_URI: 'http://example.test/api/v1/auth/google/callback' })
    ).toThrow();
    expect(() => googleConfig({ ...settings, GOOGLE_REDIRECT_URI: 'https://example.test/other' })).toThrow();
    expect(() =>
      googleConfig({
        ...settings,
        GOOGLE_REDIRECT_URI: 'https://example.test/api/v1/auth/google/callback?next=elsewhere',
      })
    ).toThrow();
  });

  it('encrypts with a fresh IV and authenticates ciphertext and owner context', () => {
    const first = encrypt('fictitious-refresh', 'owner:a'),
      second = encrypt('fictitious-refresh', 'owner:a');
    expect(first).not.toBe(second);
    expect(first).not.toContain('fictitious-refresh');
    expect(decrypt(first, 'owner:a')).toBe('fictitious-refresh');
    expect(() => decrypt(first, 'owner:b')).toThrow();
    const parts = first.split('.');
    parts[2] = Buffer.alloc(16).toString('base64url');
    expect(() => decrypt(parts.join('.'), 'owner:a')).toThrow();
  });

  it('delegates ID-token signature, issuer, audience and expiration verification to the Google library', async () => {
    const payload: TokenPayload & { nonce: string } = {
      iss: 'https://accounts.google.com',
      aud: settings.GOOGLE_CLIENT_ID,
      sub: 'subject-demo',
      iat: 1,
      exp: 2,
      email: 'demo@example.test',
      email_verified: true,
      nonce: 'nonce-demo',
    };
    jest.spyOn(OAuth2Client.prototype, 'getToken').mockImplementation(async () => ({
      tokens: { id_token: 'fictitious-id-token', refresh_token: 'fictitious-refresh', scope: 'openid email' },
      res: null,
    }));
    const verify = jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementation(async () => new LoginTicket('header', payload));
    expect(await gateway.exchange('fictitious-code', 'verifier-demo')).toMatchObject({
      subject: 'subject-demo',
      nonce: 'nonce-demo',
      email: 'demo@example.test',
    });
    expect(verify).toHaveBeenCalledWith({ idToken: 'fictitious-id-token', audience: settings.GOOGLE_CLIENT_ID });
  });

  it('requires verified email and nonce even after cryptographic token validation', async () => {
    jest
      .spyOn(OAuth2Client.prototype, 'getToken')
      .mockImplementation(async () => ({ tokens: { id_token: 'fictitious' }, res: null }));
    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementation(
        async () =>
          new LoginTicket('header', { sub: 'demo', email: 'demo@example.test', email_verified: false } as TokenPayload)
      );
    await expect(gateway.exchange('code', 'verifier')).rejects.toThrow('Google no pudo validar');
  });

  it('never returns provider error details that may contain a code or token', async () => {
    jest.spyOn(OAuth2Client.prototype, 'getToken').mockImplementation(async () => {
      throw new Error('Sensitive: fictitious-code-and-refresh');
    });
    await expect(gateway.exchange('code', 'verifier')).rejects.toThrow('Google no pudo validar');
    try {
      await gateway.exchange('code', 'verifier');
    } catch (error) {
      expect((error as Error).message).not.toContain('Sensitive');
    }
  });

  it('classifies revoked refresh tokens separately from temporary provider outages', async () => {
    jest.spyOn(OAuth2Client.prototype, 'getAccessToken').mockImplementation(async () => {
      throw { response: { status: 400, data: { error: 'invalid_grant' } } };
    });
    await expect(gateway.request('fake', 'GET', 'calendars')).rejects.toMatchObject({ reason: 'authorization' });
  });

  it('sends access tokens only in headers and honors Calendar quota backoff', async () => {
    jest
      .spyOn(OAuth2Client.prototype, 'getAccessToken')
      .mockImplementation(async () => ({ token: 'fictitious-access', res: null }));
    const call = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }), { status: 403 })
      );
    await expect(gateway.request('fake-refresh', 'GET', 'calendars/demo')).rejects.toMatchObject({
      reason: 'temporary',
    });
    expect(call.mock.calls[0][0]).toBe('https://www.googleapis.com/calendar/v3/calendars/demo');
    expect(call.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer fictitious-access' });
    expect(call.mock.calls[0][1].redirect).toBe('error');
  });

  it('updates a matching event with its ETag and suppresses invitation delivery', async () => {
    const call = jest.spyOn(gateway, 'request').mockResolvedValueOnce(remote()).mockResolvedValueOnce({});
    await gateway.upsertEvent('refresh', 'calendar@example.test', googleEventId(entry.id), body());
    expect(call.mock.calls[1]).toEqual([
      'refresh',
      'PATCH',
      `calendars/calendar%40example.test/events/${googleEventId(entry.id)}?sendUpdates=none`,
      body(),
      '"remote-etag"',
    ]);
  });

  it('creates missing events using deterministic valid Google IDs', async () => {
    const call = jest
      .spyOn(gateway, 'request')
      .mockRejectedValueOnce(new GoogleProviderError(404, 'not_found'))
      .mockResolvedValueOnce({});
    await gateway.upsertEvent('refresh', 'calendar', googleEventId(entry.id), body());
    expect(googleEventId(entry.id)).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(call.mock.calls[1][3]).toMatchObject({ id: googleEventId(entry.id) });
  });

  it('re-reads after a concurrent create and never overwrites a newer exported version', async () => {
    const call = jest
      .spyOn(gateway, 'request')
      .mockRejectedValueOnce(new GoogleProviderError(404, 'not_found'))
      .mockRejectedValueOnce(new GoogleProviderError(409, 'conflict'))
      .mockResolvedValueOnce(remote(4, 3));
    await gateway.upsertEvent('refresh', 'calendar', googleEventId(entry.id), body());
    expect(call).toHaveBeenCalledTimes(3);
    expect(call.mock.calls.map((c) => c[1])).toEqual(['GET', 'POST', 'GET']);
  });

  it('re-reads on ETag races and respects a newer agenda timezone configuration', async () => {
    const call = jest
      .spyOn(gateway, 'request')
      .mockResolvedValueOnce(remote())
      .mockRejectedValueOnce(new GoogleProviderError(412, 'conflict'))
      .mockResolvedValueOnce(remote(2, 4));
    await gateway.upsertEvent('refresh', 'calendar', googleEventId(entry.id), body());
    expect(call.mock.calls.map((c) => c[1])).toEqual(['GET', 'PATCH', 'GET']);
  });

  it('refuses to overwrite unrelated events even if an ID collision occurs', async () => {
    const call = jest
      .spyOn(gateway, 'request')
      .mockResolvedValue({ ...remote(), extendedProperties: { private: { agendaEntryId: 'unrelated' } } });
    await expect(gateway.upsertEvent('refresh', 'calendar', googleEventId(entry.id), body())).rejects.toMatchObject({
      reason: 'invalid_request',
    });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('keeps canceled sessions visible but free, without sharing private client fields', () => {
    const canceled = googleEvent(
      { ...entry, sessionStatus: 'canceled', description: 'Private note', email: 'private@example.test' },
      'UTC',
      3
    );
    expect(canceled).toMatchObject({
      summary: 'Turno · Cancelado',
      transparency: 'transparent',
      visibility: 'private',
    });
    expect(JSON.stringify(canceled)).not.toMatch(/Private note|private@example/);
  });
});
