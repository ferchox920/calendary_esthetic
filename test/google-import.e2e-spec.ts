import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { manageOwner } from '../src/modules/auth/owner-management';
import { encrypt } from '../src/modules/google/google-crypto';
import { GoogleGateway, GoogleProviderError } from '../src/modules/google/google.gateway';
import { GoogleImportService } from '../src/modules/google/google-import.service';

describe('Google Calendar as the agenda source (PostgreSQL, simulated Google)', () => {
  let app: NestExpressApplication,
    db: DataSource,
    worker: GoogleImportService,
    ownerId: string,
    token: string,
    projectId: string;
  const calendarId = 'fictitious-source@example.test';
  const fake = {
    listCalendars: jest.fn(async () => [
      { id: calendarId, summary: 'Calendario ficticio', timeZone: 'America/Argentina/Buenos_Aires', primary: true },
    ]),
    listEvents: jest.fn(),
  };
  const req = (method: string, path: string, key = randomUUID()) =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key);
  const event = (id = 'google-event-1', start = '10:00', end = '11:00') => ({
    id,
    summary: 'Evento ficticio',
    description: 'Notas de Google',
    status: 'confirmed',
    etag: `etag-${id}`,
    start: { dateTime: `2035-06-11T${start}:00-03:00` },
    end: { dateTime: `2035-06-11T${end}:00-03:00` },
  });
  const page = (items: any[] = [], nextSyncToken = 'next-sync') => ({
    items,
    nextSyncToken,
    timeZone: 'America/Argentina/Buenos_Aires',
  });
  const pull = async (response: any) => {
    fake.listEvents.mockResolvedValue(response);
    await req('post', '/integrations/google/import').expect(201);
    await worker.runOnce(1);
  };
  const source = async () => (await db.query('SELECT * FROM google_calendar_source'))[0];
  const imported = async () => db.query('SELECT * FROM google_import_event ORDER BY "eventId"');
  const day = async () => (await req('get', '/agenda/day?date=2035-06-11').expect(200)).body;

  beforeAll(async () => {
    Object.assign(process.env, {
      GOOGLE_ENABLED: 'true',
      GOOGLE_CLIENT_ID: 'demo.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'fictitious-secret',
      GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 42).toString('base64'),
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
    worker = app.get(GoogleImportService);
    expect(db.options.database).toBe('calendary_esthetic_test');
    await db.runMigrations();
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    fake.listEvents.mockReset();
    fake.listCalendars.mockResolvedValue([
      { id: calendarId, summary: 'Calendario ficticio', timeZone: 'America/Argentina/Buenos_Aires', primary: true },
    ]);
    await db.query('TRUNCATE owner_account,client,working_window CASCADE');
    await db.query(
      `UPDATE agenda_settings SET timezone='America/Argentina/Buenos_Aires',"defaultPrepMinutes"=0,"defaultCleanupMinutes"=0,version=1 WHERE id=1`
    );
    await manageOwner(db, 'init', 'source-owner@example.test', 'Fictitious-source-password');
    ownerId = (await db.query('SELECT id FROM owner_account'))[0].id;
    token = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'source-owner@example.test', password: 'Fictitious-source-password' })
        .expect(200)
    ).body.credential.access_token;
    await db.query(
      `INSERT INTO google_connection ("ownerId",subject,email,"refreshTokenEncrypted","sourceReadEnabled") VALUES ($1,'source-sub','source@example.test',$2,true)`,
      [ownerId, encrypt('fake-refresh', `refresh:${ownerId}:source-sub`)]
    );
    await req('post', '/integrations/google/source').send({ calendarId }).expect(201);
    await db.query(`UPDATE google_calendar_source SET "rangeFrom"='2030-01-01Z',"rangeTo"='2037-01-01Z'`);
    await req('post', '/agenda/working-windows')
      .send({ version: 1, windows: [{ weekday: 1, localStart: '09:00', localEnd: '18:00', validFrom: '2035-01-01' }] })
      .expect(201);
    const clientId = (
      await req('post', '/clients').send({ name: 'Cliente ficticia', phone: '000-fixture' }).expect(201)
    ).body.id;
    projectId = (await req('post', '/projects').send({ clientId, title: 'Tratamiento ficticio' }).expect(201)).body.id;
  });
  afterAll(async () => {
    if (db?.isInitialized && db.options.database === 'calendary_esthetic_test')
      await db.query('TRUNCATE owner_account,client,working_window CASCADE');
    if (app) await app.close();
  });

  it('protects source selection, rejects unknown calendars and returns no synchronization or refresh tokens', async () => {
    await request(app.getHttpServer()).get('/api/v1/integrations/google/calendars').expect(401);
    await req('post', '/integrations/google/source').send({ calendarId: 'not-accessible' }).expect(400);
    const status = (await req('get', '/integrations/google').expect(200)).body;
    expect(status).toMatchObject({
      sourceReadEnabled: true,
      source: { calendarId, fullSync: true },
      importedEvents: 0,
    });
    expect(JSON.stringify(status)).not.toMatch(/fake-refresh|syncToken|pageToken|refreshTokenEncrypted/);
    expect((await req('get', '/integrations/google/calendars').expect(200)).body).toHaveLength(1);
  });

  it('imports pages once, reserves their time, and manually links without duplicating a session or creating clients', async () => {
    fake.listEvents
      .mockResolvedValueOnce({ items: [event()], nextPageToken: 'page-two' })
      .mockResolvedValueOnce(page([event('google-event-2', '12:00', '13:00')]));
    await worker.runOnce(2);
    expect((await source()).syncToken).toBe('next-sync');
    expect(await imported()).toHaveLength(2);
    expect((await day()).entries).toHaveLength(2);
    const rows = await imported();
    const key = randomUUID();
    const link = { projectId, version: rows[0].version };
    const first = (await req('post', `/integrations/google/events/${rows[0].id}/link`, key).send(link).expect(201))
      .body;
    expect(
      (await req('post', `/integrations/google/events/${rows[0].id}/link`, key).send(link).expect(201)).body
    ).toEqual(first);
    expect((await req('get', `/projects/${projectId}`).expect(200)).body.sessions).toHaveLength(1);
    expect((await db.query('SELECT count(*)::int AS count FROM client'))[0].count).toBe(1);
    expect((await db.query('SELECT count(*)::int AS count FROM schedule_entry'))[0].count).toBe(0);
    await req('post', '/sessions')
      .send({
        projectId,
        description: 'Local clash',
        startAt: '2035-06-11T10:30:00-03:00',
        endAt: '2035-06-11T11:30:00-03:00',
      })
      .expect(409);
    const availability = (await req('get', '/agenda/availability?date=2035-06-11').expect(200)).body.free;
    expect(availability).toHaveLength(3);
  });

  it('preserves the manual link across changes, makes deletion free and retains client history', async () => {
    await pull(page([event()]));
    const [row] = await imported();
    await req('post', `/integrations/google/events/${row.id}/link`)
      .send({ projectId, version: row.version })
      .expect(201);
    await pull(page([event('google-event-1', '14:00', '15:00')], 'changed'));
    const [updated] = await imported();
    expect(updated).toMatchObject({ id: row.id, projectId, version: 3 });
    expect(updated.startAt.toISOString()).toBe('2035-06-11T17:00:00.000Z');
    await req('post', `/integrations/google/events/${row.id}/link`).send({ projectId: null, version: 1 }).expect(409);
    await pull(page([{ id: 'google-event-1', status: 'cancelled' }], 'deleted'));
    expect((await imported())[0]).toMatchObject({ projectId, status: 'cancelled' });
    expect((await req('get', `/projects/${projectId}`).expect(200)).body.sessions[0].sessionStatus).toBe('canceled');
    await req('post', '/sessions')
      .send({
        projectId,
        description: 'Freed slot',
        startAt: '2035-06-11T14:00:00-03:00',
        endAt: '2035-06-11T15:00:00-03:00',
      })
      .expect(201);
  });

  it('handles expired cursors with a full paginated snapshot, never clearing unseen events on an incomplete page', async () => {
    await pull(page([event(), event('second', '12:00', '13:00')]));
    await req('post', '/integrations/google/import').expect(201);
    fake.listEvents.mockRejectedValueOnce(new GoogleProviderError(410, 'not_found'));
    await worker.runOnce(1);
    expect((await source()).syncToken).toBeNull();
    expect((await imported()).every((e) => e.status === 'confirmed')).toBe(true);
    fake.listEvents.mockResolvedValueOnce({ items: [event()], nextPageToken: 'last-page' });
    await worker.runOnce(1);
    expect((await imported()).every((e) => e.status === 'confirmed')).toBe(true);
    fake.listEvents.mockResolvedValueOnce(page([], 'fresh-sync'));
    await worker.runOnce(1);
    expect((await imported()).find((e) => e.eventId === 'second').status).toBe('cancelled');
    expect((await source()).syncToken).toBe('fresh-sync');
  });

  it('preserves overlapping Google events and blocks the entire all-day interval but not transparent events', async () => {
    await pull(
      page([
        event('series-one'),
        { ...event('series-two', '10:30', '11:30'), recurringEventId: 'series' },
        { id: 'all-day', start: { date: '2035-06-11' }, end: { date: '2035-06-12' } },
      ])
    );
    expect((await day()).entries).toHaveLength(3);
    expect((await req('get', '/agenda/availability?date=2035-06-11').expect(200)).body.free).toEqual([]);
    await pull(
      page([
        { id: 'all-day', status: 'cancelled' },
        { ...event('free', '15:00', '16:00'), transparency: 'transparent' },
      ])
    );
    await req('post', '/sessions')
      .send({
        projectId,
        description: 'Transparent slot',
        startAt: '2035-06-11T15:00:00-03:00',
        endAt: '2035-06-11T16:00:00-03:00',
      })
      .expect(201);
  });

  it('keeps the last good snapshot on quota failure or malformed events and does not advance its cursor', async () => {
    await pull(page([event()], 'good-sync'));
    await req('post', '/integrations/google/import').expect(201);
    fake.listEvents.mockRejectedValueOnce(new GoogleProviderError(429, 'temporary'));
    await worker.runOnce(1);
    expect(await source()).toMatchObject({ syncToken: 'good-sync', lastError: 'temporary', attempts: 1 });
    expect((await day()).entries).toHaveLength(1);
    await pull(page([{ id: 'bad' }], 'bad-sync'));
    expect(await source()).toMatchObject({ syncToken: 'good-sync', lastError: 'invalid_event' });
    expect(await imported()).toHaveLength(1);
  });

  it('discards late results after a source switch and stops reading revoked credentials', async () => {
    fake.listEvents.mockImplementationOnce(async () => {
      await db.query(
        `UPDATE google_calendar_source SET generation=uuid_generate_v4(),"lockToken"=NULL,"lockedUntil"=NULL`
      );
      return page([event()]);
    });
    await worker.runOnce(1);
    expect(await imported()).toHaveLength(0);
    fake.listEvents.mockRejectedValueOnce(new GoogleProviderError(401, 'authorization'));
    await worker.runOnce(1);
    expect((await req('get', '/integrations/google').expect(200)).body.needsReconnect).toBe(true);
    const calls = fake.listEvents.mock.calls.length;
    await worker.runOnce(1);
    expect(fake.listEvents).toHaveBeenCalledTimes(calls);
  });
});
