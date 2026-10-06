import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createHash, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { manageOwner } from '../src/modules/auth/owner-management';
import { CALENDAR_SCOPE } from '../src/modules/google/google-config';
import { decrypt, hash } from '../src/modules/google/google-crypto';
import { GoogleGateway, GoogleProviderError } from '../src/modules/google/google.gateway';
import { GoogleSyncService } from '../src/modules/google/google-sync.service';

describe('Google integration (real PostgreSQL, Google network substituted)', () => {
  let app: NestExpressApplication,
    db: DataSource,
    sync: GoogleSyncService,
    token: string,
    ownerId: string,
    projectId: string;
  const email = 'google-owner-demo@example.test',
    password = 'Fictitious-google-test-password';
  const key = Buffer.alloc(32, 42).toString('base64');
  const verified = new Map<string, any>();
  const events = new Map<string, any>();
  const realGateway = new GoogleGateway();
  const fake = {
    authorizationUrl: jest.fn((state, nonce, challenge, calendar) =>
      realGateway.authorizationUrl(state, nonce, challenge, calendar)
    ),
    exchange: jest.fn(async (code, verifier) => {
      const response = verified.get(code);
      if (!response || createHash('sha256').update(verifier).digest('base64url') !== response.challenge)
        throw new BadRequestException('Fictitious invalid code');
      return response.identity;
    }),
    createCalendar: jest.fn(async () => ({ id: `demo-calendar-${randomUUID()}@example.test` })),
    upsertEvent: jest.fn(async (_refresh, calendarId, eventId, body) => {
      events.set(`${calendarId}:${eventId}`, body);
    }),
    revoke: jest.fn(async () => undefined),
  };
  const req = (method: string, path: string) =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID());
  const book = () =>
    req('post', '/sessions').send({
      projectId,
      description: 'Private client note never exported',
      startAt: '2035-06-11T10:00:00-03:00',
      endAt: '2035-06-11T11:00:00-03:00',
    });
  const login = async () => {
    token = (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(200)).body
      .credential.access_token;
  };

  async function begin(connect = true, overrides: any = {}) {
    const response = connect
      ? await req('post', '/integrations/google/connect').expect(201)
      : await request(app.getHttpServer()).get('/api/v1/auth/google/start').expect(302);
    const url = new URL(connect ? response.body.authorizationUrl : response.headers.location);
    const code = `demo-${randomUUID()}`;
    verified.set(code, {
      challenge: url.searchParams.get('code_challenge'),
      identity: {
        subject: 'google-sub-demo',
        email: 'google-demo@example.test',
        nonce: url.searchParams.get('nonce'),
        refreshToken: 'fictitious-google-refresh-only',
        scopes: ['openid', 'email', CALENDAR_SCOPE],
        ...overrides,
      },
    });
    return {
      response,
      url,
      code,
      state: url.searchParams.get('state'),
      cookie: response.headers['set-cookie'][0].split(';')[0],
    };
  }
  const callback = (attempt: Awaited<ReturnType<typeof begin>>) =>
    request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ state: attempt.state, code: attempt.code, scope: 'openid email', authuser: '0', prompt: 'consent' })
      .set('Cookie', attempt.cookie);
  const connect = async () => callback(await begin()).expect(200);

  beforeAll(async () => {
    Object.assign(process.env, {
      GOOGLE_ENABLED: 'true',
      GOOGLE_CLIENT_ID: 'demo.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'fictitious-client-secret',
      GOOGLE_REDIRECT_URI: 'http://127.0.0.1:3000/api/v1/auth/google/callback',
      GOOGLE_TOKEN_ENCRYPTION_KEY: key,
      GOOGLE_SYNC_WORKER_ENABLED: 'false',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleGateway)
      .useValue(fake)
      .compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    setupApp(app);
    await app.init();
    db = app.get(DataSource);
    sync = app.get(GoogleSyncService);
    expect(db.options.database).toBe('calendary_esthetic_test');
    await db.runMigrations();
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    events.clear();
    verified.clear();
    await db.query('TRUNCATE owner_account,client,working_window CASCADE');
    await db.query(
      `UPDATE agenda_settings SET timezone='America/Argentina/Buenos_Aires',"defaultPrepMinutes"=15,"defaultCleanupMinutes"=15,version=1`
    );
    await manageOwner(db, 'init', email, password);
    ownerId = (await db.query('SELECT id FROM owner_account'))[0].id;
    await login();
    await req('post', '/agenda/working-windows')
      .send({
        version: 1,
        windows: Array.from({ length: 7 }, (_, i) => ({
          weekday: i + 1,
          localStart: '09:00',
          localEnd: '18:00',
          validFrom: '2035-01-01',
        })),
      })
      .expect(201);
    const clientId = (
      await req('post', '/clients')
        .send({ name: 'Private Demo', phone: '000-fictitious', email: 'private-client@example.test' })
        .expect(201)
    ).body.id;
    projectId = (await req('post', '/projects').send({ clientId, title: 'Private project never exported' }).expect(201))
      .body.id;
  });
  afterAll(async () => {
    if (db?.isInitialized && db.options.database === 'calendary_esthetic_test') {
      await db.query('TRUNCATE owner_account,client,working_window CASCADE');
      await db.query(
        `UPDATE agenda_settings SET timezone='America/Argentina/Buenos_Aires',"defaultPrepMinutes"=15,"defaultCleanupMinutes"=15,version=1`
      );
    }
    if (app) await app.close();
    process.env.GOOGLE_ENABLED = 'false';
  });

  it('is opt-in, protects connection endpoints and preserves password access when disabled', async () => {
    await request(app.getHttpServer()).post('/api/v1/integrations/google/connect').expect(401);
    expect((await req('get', '/integrations/google').expect(200)).body).toMatchObject({
      configured: true,
      loginConnected: false,
      calendarConnected: false,
    });
    process.env.GOOGLE_ENABLED = 'false';
    try {
      await request(app.getHttpServer()).get('/api/v1/auth/google/start').expect(503);
      await req('post', '/integrations/google/connect').expect(503);
      await login();
    } finally {
      process.env.GOOGLE_ENABLED = 'true';
    }
  });

  it('uses browser-bound state, nonce, PKCE and narrowly scoped offline calendar permission', async () => {
    const attempt = await begin();
    expect(attempt.url.searchParams.get('scope').split(' ')).toEqual(['openid', 'email', CALENDAR_SCOPE]);
    expect(attempt.url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(attempt.url.searchParams.get('access_type')).toBe('offline');
    expect(attempt.response.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(attempt.response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(attempt.response.headers['set-cookie'][0]).toContain('Path=/api/v1/auth/google/callback');
    const [stored] = await db.query('SELECT * FROM google_oauth_state');
    expect(stored.stateHash).toBe(hash(attempt.state));
    expect(stored.nonceHash).toBe(hash(attempt.url.searchParams.get('nonce')));
    expect(
      createHash('sha256')
        .update(decrypt(stored.verifierEncrypted, `oauth:${stored.stateHash}`))
        .digest('base64url')
    ).toBe(attempt.url.searchParams.get('code_challenge'));
  });

  it('links only through an authenticated owner and never exposes stored tokens in status/audit', async () => {
    const result = await connect();
    expect(result.body).toEqual({ mode: 'connect', googleEmail: 'google-demo@example.test', calendarQueued: true });
    const [row] = await db.query('SELECT * FROM google_connection');
    expect(row.ownerId).toBe(ownerId);
    expect(row.refreshTokenEncrypted).not.toContain('fictitious-google-refresh');
    expect(decrypt(row.refreshTokenEncrypted, `refresh:${ownerId}:google-sub-demo`)).toBe(
      'fictitious-google-refresh-only'
    );
    const status = (await req('get', '/integrations/google').expect(200)).body;
    expect(status).toMatchObject({ loginConnected: true, calendarConnected: true, calendarReady: false });
    const audit = (await req('get', '/audit?entityType=google').expect(200)).body;
    expect(audit[0]).toMatchObject({
      actorId: ownerId,
      action: 'connect',
      after: { googleEmail: 'google-demo@example.test' },
    });
    expect(JSON.stringify([result.body, status, audit])).not.toMatch(
      /fictitious-google-refresh|refreshToken|verifierEncrypted|nonceHash/
    );
  });

  it('logs in only the previously bound Google subject and issues a private application cookie', async () => {
    await callback(await begin(false)).expect(401);
    await connect();
    const result = await callback(await begin(false)).expect(200);
    expect(result.body).toEqual({ mode: 'login', profile: { id: ownerId, name: 'Gabriela', email } });
    expect(
      (result.headers['set-cookie'] as unknown as string[]).some(
        (c) => c.startsWith('agenda_session=') && c.includes('HttpOnly') && c.includes('SameSite=Strict')
      )
    ).toBe(true);
    await request(app.getHttpServer())
      .get('/api/v1/auth/profile')
      .set('Cookie', result.headers['set-cookie'])
      .expect(200);
    await callback(await begin(false, { subject: 'foreign-subject' })).expect(401);
    await callback(await begin(true, { subject: 'foreign-subject' })).expect(409);
  });

  it('rejects forged, missing, expired and replayed browser states before exchanging codes', async () => {
    const attempt = await begin();
    await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ state: attempt.state, code: attempt.code })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ state: attempt.state, code: attempt.code })
      .set('Cookie', 'agenda_google_state=wrong')
      .expect(400);
    expect(fake.exchange).not.toHaveBeenCalled();
    const results = await Promise.all([callback(attempt), callback(attempt)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(fake.exchange).toHaveBeenCalledTimes(1);
    const expired = await begin();
    await db.query(`UPDATE google_oauth_state SET "expiresAt"=now()-interval '1 minute'`);
    await callback(expired).expect(400);
  });

  it('rejects incorrect nonces, denied consent, insufficient scope and missing initial refresh tokens', async () => {
    await callback(await begin(true, { nonce: 'wrong-nonce' })).expect(401);
    await callback(await begin(true, { scopes: ['openid', 'email'] })).expect(400);
    await callback(await begin(true, { refreshToken: undefined })).expect(400);
    const denied = await begin();
    await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ state: denied.state, error: 'access_denied' })
      .set('Cookie', denied.cookie)
      .expect(400);
    expect((await db.query('SELECT count(*) FROM google_connection'))[0].count).toBe('0');
  });

  it('rejects linking callbacks after logout changed the owner session', async () => {
    const attempt = await begin();
    await req('post', '/auth/logout').expect(204);
    await callback(attempt).expect(401);
    expect((await db.query('SELECT count(*) FROM google_connection'))[0].count).toBe('0');
  });

  it('exports existing and new entries without client data, invitation emails or duplicate events', async () => {
    const first = (await book().expect(201)).body;
    expect((await db.query('SELECT count(*) FROM google_sync_job'))[0].count).toBe('0');
    await connect();
    await sync.runOnce();
    expect(fake.createCalendar).toHaveBeenCalledTimes(1);
    expect(events.size).toBe(1);
    const exported = [...events.values()][0];
    expect(exported).toMatchObject({
      summary: 'Turno · Pendiente',
      visibility: 'private',
      transparency: 'opaque',
      start: { dateTime: first.startAt },
    });
    expect(JSON.stringify(exported)).not.toMatch(
      /private-client|Private Demo|Private project|Private client note|000-fictitious|attendees/
    );
    await req('post', '/integrations/google/sync').expect(201);
    await sync.runOnce();
    expect(events.size).toBe(1);
    expect(fake.createCalendar).toHaveBeenCalledTimes(1);
    expect((await req('get', '/integrations/google')).body).toMatchObject({ calendarReady: true, pendingJobs: 0 });
  });

  it('keeps successful reservations and durable retry jobs when Google is unavailable', async () => {
    await connect();
    const first = (await book().expect(201)).body;
    fake.upsertEvent.mockRejectedValueOnce(new GoogleProviderError(503, 'temporary'));
    await sync.runOnce();
    expect((await req('get', `/sessions/${first.id}`)).body.id).toBe(first.id);
    const [job] = await db.query('SELECT * FROM google_sync_job');
    expect(job.attempts).toBe(1);
    expect(job.lastError).toBe('temporary');
    await db.query('UPDATE google_sync_job SET "nextAttemptAt"=now()');
    const other = new GoogleSyncService(db, fake as unknown as GoogleGateway);
    await Promise.all([sync.runOnce(), other.runOnce()]);
    expect(fake.upsertEvent).toHaveBeenCalledTimes(2);
    expect(events.size).toBe(1);
    expect((await db.query('SELECT count(*) FROM google_sync_job'))[0].count).toBe('0');
  });

  it('retains a newer revision arriving during an export and then sends the cancellation', async () => {
    await connect();
    const first = (await book().expect(201)).body;
    let entered: () => void, release: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    fake.upsertEvent.mockImplementationOnce(async (_refresh, calendarId, eventId, body) => {
      entered();
      await wait;
      events.set(`${calendarId}:${eventId}`, body);
    });
    const processing = sync.runOnce(1);
    await started;
    await req('post', `/sessions/${first.id}/cancel`)
      .send({ version: 1, reason: 'Fictitious cancellation' })
      .expect(201);
    release();
    await processing;
    expect((await db.query('SELECT count(*) FROM google_sync_job'))[0].count).toBe('1');
    await sync.runOnce();
    expect(events.size).toBe(1);
    expect([...events.values()][0]).toMatchObject({ summary: 'Turno · Cancelado', transparency: 'transparent' });
    expect((await db.query('SELECT "entryVersion" FROM google_event_mapping'))[0].entryVersion).toBe(2);
  });

  it('rolls back outbox jobs together with a failed booking/audit transaction', async () => {
    await connect();
    await db.query(
      `CREATE FUNCTION google_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$`
    );
    await db.query(
      'CREATE TRIGGER google_test_fail_audit BEFORE INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION google_test_fail_audit()'
    );
    try {
      await book().expect(500);
      expect((await db.query('SELECT count(*) FROM schedule_entry'))[0].count).toBe('0');
      expect((await db.query('SELECT count(*) FROM google_sync_job'))[0].count).toBe('0');
    } finally {
      await db.query('DROP TRIGGER google_test_fail_audit ON audit_event');
      await db.query('DROP FUNCTION google_test_fail_audit()');
    }
  });

  it('pauses revoked credentials and queues the complete agenda after reconnecting', async () => {
    await connect();
    await book().expect(201);
    fake.upsertEvent.mockRejectedValueOnce(new GoogleProviderError(401, 'authorization'));
    await sync.runOnce();
    expect((await req('get', '/integrations/google')).body.needsReconnect).toBe(true);
    await req('post', '/sessions')
      .send({
        projectId,
        description: 'Another demo',
        startAt: '2035-06-12T10:00:00-03:00',
        endAt: '2035-06-12T11:00:00-03:00',
      })
      .expect(201);
    await connect();
    await sync.runOnce();
    expect(events.size).toBe(2);
    expect((await req('get', '/integrations/google')).body.needsReconnect).toBe(false);
  });

  it('recreates a removed application calendar and exports its entries again', async () => {
    await connect();
    await book().expect(201);
    fake.upsertEvent.mockRejectedValueOnce(new GoogleProviderError(404, 'not_found'));
    await sync.runOnce();
    expect((await req('get', '/integrations/google')).body.calendarReady).toBe(false);
    await sync.runOnce();
    expect(fake.createCalendar).toHaveBeenCalledTimes(2);
    expect(events.size).toBe(1);
    expect((await req('get', '/integrations/google')).body.pendingJobs).toBe(0);
  });

  it('disconnects locally, revokes permission, invalidates sessions and preserves exported events', async () => {
    await connect();
    await book().expect(201);
    await sync.runOnce();
    const disconnected = (await req('delete', '/integrations/google').expect(200)).body;
    expect(disconnected).toEqual({ disconnected: true, googlePermissionRevoked: true });
    await req('get', '/auth/profile').expect(401);
    expect(events.size).toBe(1);
    expect(
      (await db.query('SELECT "refreshTokenEncrypted" FROM google_connection'))[0].refreshTokenEncrypted
    ).toBeNull();
    await callback(await begin(false)).expect(401);
    await login();
    expect((await req('get', '/integrations/google').expect(200)).body.loginConnected).toBe(false);
  });

  it('can disconnect even after losing the encryption key, without claiming remote revocation', async () => {
    await connect();
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 99).toString('base64');
    try {
      expect((await req('delete', '/integrations/google').expect(200)).body.googlePermissionRevoked).toBe(false);
      expect(
        (await db.query('SELECT "refreshTokenEncrypted" FROM google_connection'))[0].refreshTokenEncrypted
      ).toBeNull();
    } finally {
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = key;
    }
  });

  it('retries a database failure after Google received the event without demanding OAuth reconnection', async () => {
    await connect();
    await book().expect(201);
    await db.query(
      `CREATE FUNCTION google_test_fail_mapping() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test mapping failure'; END $$`
    );
    await db.query(
      'CREATE TRIGGER google_test_fail_mapping BEFORE INSERT ON google_event_mapping FOR EACH ROW EXECUTE FUNCTION google_test_fail_mapping()'
    );
    try {
      await sync.runOnce();
      expect(events.size).toBe(1);
      expect((await req('get', '/integrations/google')).body.needsReconnect).toBe(false);
      expect((await db.query('SELECT "lastError" FROM google_sync_job'))[0].lastError).toBe('temporary');
    } finally {
      await db.query('DROP TRIGGER google_test_fail_mapping ON google_event_mapping');
      await db.query('DROP FUNCTION google_test_fail_mapping()');
    }
    await db.query('UPDATE google_sync_job SET "nextAttemptAt"=now()');
    await sync.runOnce();
    expect(events.size).toBe(1);
    expect((await req('get', '/integrations/google')).body.pendingJobs).toBe(0);
  });

  it('serializes initial calendar provisioning across two worker instances', async () => {
    await connect();
    await book().expect(201);
    let entered: () => void, release: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    fake.createCalendar.mockImplementationOnce(async () => {
      entered();
      await wait;
      return { id: 'parallel-demo@example.test' };
    });
    const first = sync.runOnce();
    await started;
    try {
      await req('post', '/integrations/google/sync').expect(201);
      const other = new GoogleSyncService(db, fake as unknown as GoogleGateway);
      await other.runOnce();
      expect(fake.createCalendar).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await first;
    }
    expect(events.size).toBe(1);
  });

  it('invalidates the local session even if Google was never linked', async () => {
    expect((await req('delete', '/integrations/google').expect(200)).body).toEqual({
      disconnected: true,
      googlePermissionRevoked: false,
    });
    await req('get', '/auth/profile').expect(401);
    await login();
  });

  it('finishes local disconnection when remote revocation is temporarily unavailable', async () => {
    await connect();
    fake.revoke.mockRejectedValueOnce(new GoogleProviderError(503, 'temporary'));
    expect((await req('delete', '/integrations/google').expect(200)).body.googlePermissionRevoked).toBe(false);
    expect(
      (await db.query('SELECT "refreshTokenEncrypted","calendarEnabled" FROM google_connection'))[0]
    ).toMatchObject({ refreshTokenEncrypted: null, calendarEnabled: false });
    await login();
  });

  it('allows manual retry of calendar creation after its automatic retry limit', async () => {
    await connect();
    await book().expect(201);
    await db.query(
      `UPDATE google_connection SET "provisionAttempts"=12,"provisionUntil"=now()+interval '1 hour',"lastError"='temporary'`
    );
    await sync.runOnce();
    expect(fake.createCalendar).not.toHaveBeenCalled();
    await req('post', '/integrations/google/sync').expect(201);
    await sync.runOnce();
    expect(fake.createCalendar).toHaveBeenCalledTimes(1);
    expect((await req('get', '/integrations/google')).body.calendarReady).toBe(true);
  });
});
