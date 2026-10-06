import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Temporal } from '@js-temporal/polyfill';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { manageOwner } from '../src/modules/auth/owner-management';

describe('API user journeys (TCP HTTP and real PostgreSQL)', () => {
  let app: NestExpressApplication, db: DataSource, base: string, cookie: string, bearer: string, ownerId: string;
  const email = 'api-journey-demo@example.test';
  const password = 'Fictitious-api-journey-password';
  const origin = 'http://127.0.0.1:3000';
  const zone = 'America/Argentina/Buenos_Aires';
  const day = Temporal.Now.zonedDateTimeISO(zone).toPlainDate().add({ days: 7 }).toString();
  const at = (time: string) => `${day}T${time}:00-03:00`;

  async function start() {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    setupApp(app);
    await app.init();
    db = app.get(DataSource);
    // Assert the actual server connection before any cleanup or fixture writes.
    const options = db.options;
    if (options.type !== 'postgres') throw new Error('API journeys require PostgreSQL');
    expect(options.host).toBe('127.0.0.1');
    expect(db.options.database).toBe('calendary_esthetic_test');
    expect((await db.query('SELECT current_database() AS database'))[0].database).toBe('calendary_esthetic_test');
    await db.runMigrations();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }

  function call(method: string, path: string, key = randomUUID()) {
    return request(base)
      [method](`/api/v1${path}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Idempotency-Key', key);
  }

  async function login() {
    const response = await request(base)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    cookie = cookies.find((value) => value.startsWith('agenda_session=')).split(';')[0];
    bearer = response.body.credential.access_token;
    ownerId = response.body.profile.id;
  }

  async function configure() {
    await call('post', '/agenda/working-windows')
      .send({
        version: 1,
        windows: Array.from({ length: 7 }, (_, i) => [
          { weekday: i + 1, localStart: '09:00', localEnd: '13:00', validFrom: day },
          { weekday: i + 1, localStart: '14:00', localEnd: '18:00', validFrom: day },
        ]).flat(),
      })
      .expect(201);
  }

  async function clientAndProject(name = 'Cliente Recorrido Demo') {
    const client = (await call('post', '/clients').send({ name, phone: '000-demo-only' }).expect(201)).body;
    const project = (
      await call('post', '/projects').send({ clientId: client.id, title: 'Proyecto Recorrido Demo' }).expect(201)
    ).body;
    return { client, project };
  }

  const sessionBody = (projectId: string, start = '10:00', end = '11:00') => ({
    projectId,
    description: 'Sesión ficticia del recorrido',
    startAt: at(start),
    endAt: at(end),
  });
  const sessionHistory = async (id: string) =>
    (await call('get', `/audit?entityType=session&entityId=${id}`).expect(200)).body;

  beforeAll(start);
  beforeEach(async () => {
    await db.query('TRUNCATE owner_account,client,working_window CASCADE');
    await db.query(
      `UPDATE agenda_settings SET timezone=$1,"defaultPrepMinutes"=15,"defaultCleanupMinutes"=15,version=1`,
      [zone]
    );
    await manageOwner(db, 'init', email, password);
    await login();
  });
  afterAll(async () => {
    if (db?.isInitialized && db.options.database === 'calendary_esthetic_test') {
      await db.query('TRUNCATE owner_account,client,working_window CASCADE');
      await db.query(
        `UPDATE agenda_settings SET timezone=$1,"defaultPrepMinutes"=15,"defaultCleanupMinutes"=15,version=1`,
        [zone]
      );
    }
    if (app) await app.close();
  });

  it('completes a two-session project, rejects a conflicting move and frees a canceled slot', async () => {
    await configure();
    const { client, project } = await clientAndProject();
    expect(project).toMatchObject({ quoteAmount: null, quoteStatus: 'unevaluated' });
    const first = (await call('post', '/sessions').send(sessionBody(project.id)).expect(201)).body;
    const second = (
      await call('post', '/sessions')
        .send(sessionBody(project.id, '14:30', '15:30'))
        .expect(201)
    ).body;
    const confirmed = (await call('post', `/sessions/${first.id}/confirm`).send({ version: 1 }).expect(201)).body;
    expect(confirmed).toMatchObject({ id: first.id, version: 2, sessionStatus: 'confirmed' });

    const conflict = await call('post', `/sessions/${first.id}/reschedule`)
      .send({
        version: 2,
        startAt: at('14:30'),
        endAt: at('15:30'),
        reason: 'Conflicto ficticio',
      })
      .expect(409);
    expect(conflict.body.conflicts.map((c) => c.id)).toContain(second.id);
    expect((await call('get', `/sessions/${first.id}`)).body).toEqual(confirmed);
    expect(await sessionHistory(first.id)).toHaveLength(2);

    const moved = (
      await call('post', `/sessions/${first.id}/reschedule`)
        .send({
          version: 2,
          startAt: at('11:30'),
          endAt: at('12:30'),
          reason: 'Nuevo horario ficticio',
        })
        .expect(201)
    ).body;
    expect(moved).toMatchObject({ id: first.id, version: 3, sessionStatus: 'confirmed' });
    await call('post', `/sessions/${second.id}/cancel`)
      .send({ version: 1, reason: 'Cancelación ficticia' })
      .expect(201);
    const replacement = (
      await call('post', '/sessions')
        .send(sessionBody(project.id, '14:30', '15:30'))
        .expect(201)
    ).body;
    expect(replacement.id).not.toBe(second.id);

    const detail = (await call('get', `/projects/${project.id}`).expect(200)).body;
    expect(detail.clientId).toBe(client.id);
    expect(detail.sessions).toHaveLength(3);
    expect(detail.sessions.find((s) => s.id === second.id).sessionStatus).toBe('canceled');
    const agenda = (await call('get', `/agenda/day?date=${day}`).expect(200)).body;
    expect(agenda.entries.filter((e) => e.sessionStatus !== 'canceled')).toHaveLength(2);
    expect(agenda.entries.every((e) => e.clientName === client.name)).toBe(true);
    const history = await sessionHistory(first.id);
    expect(history.map((e) => e.action)).toEqual(['reschedule', 'confirmed', 'create']);
    expect(history.every((e) => e.actorId === ownerId)).toBe(true);
    expect(history[0]).toMatchObject({ before: { startAt: first.startAt }, after: { startAt: moved.startAt } });
  });

  it('preserves settings, records, audit and authentication across an API restart, then revokes the session on logout', async () => {
    await configure();
    const { client, project } = await clientAndProject();
    const first = (await call('post', '/sessions').send(sessionBody(project.id)).expect(201)).body;
    const settings = (await call('get', '/agenda/settings')).body;
    const history = await sessionHistory(first.id);
    await app.close();
    await start(); // New Nest application, new database connection, new TCP listener; no fixture reset.

    expect((await call('get', '/auth/profile').expect(200)).body.id).toBe(ownerId);
    expect((await call('get', `/clients/${client.id}`).expect(200)).body).toEqual(client);
    expect((await call('get', `/sessions/${first.id}`).expect(200)).body).toEqual(first);
    expect((await call('get', '/agenda/settings').expect(200)).body).toEqual(settings);
    expect(await sessionHistory(first.id)).toEqual(history);
    await call('post', '/auth/logout').expect(204);
    await call('get', '/auth/profile').expect(401);
    await request(base).get('/api/v1/auth/profile').set('Authorization', `Bearer ${bearer}`).expect(401);
    await login();
    expect((await call('get', `/projects/${project.id}`).expect(200)).body.sessions[0].id).toBe(first.id);
  });

  it('searches literal wildcard characters, paginates clients and archives without deleting project history', async () => {
    const { client, project } = await clientAndProject('Cliente Demo %_ Literal');
    await clientAndProject('Cliente Demo AA Normal');
    const literal = (await call('get', '/clients?search=%25_').expect(200)).body;
    expect(literal.map((row) => row.id)).toEqual([client.id]);
    const firstPage = (await call('get', '/clients?page=1&limit=1').expect(200)).body;
    const secondPage = (await call('get', '/clients?page=2&limit=1').expect(200)).body;
    expect(firstPage[0].totalCount).toBe(2);
    expect(secondPage[0].totalCount).toBe(2);
    expect(firstPage[0].id).not.toBe(secondPage[0].id);
    await call('get', '/clients?page=0').expect(400);
    await call('get', '/clients?limit=101').expect(400);
    await call('get', '/clients?archived=invalid').expect(400);

    await call('post', `/projects/${project.id}/archive`).send({ version: 1 }).expect(201);
    await call('post', `/clients/${client.id}/archive`).send({ version: 1 }).expect(201);
    expect((await call('get', '/clients?archived=true').expect(200)).body.map((row) => row.id)).toEqual([client.id]);
    expect((await call('get', `/clients/${client.id}/projects?archived=true`).expect(200)).body[0].id).toBe(project.id);
    expect((await call('get', `/projects/${project.id}`).expect(200)).body.archivedAt).toBeTruthy();
    await call('post', '/projects').send({ clientId: client.id, title: 'No debe crearse' }).expect(409);
  });

  it('keeps booking usable while Google is disabled and releases a block only through an explicit update', async () => {
    await configure();
    const { project } = await clientAndProject();
    expect((await call('get', '/integrations/google').expect(200)).body.configured).toBe(false);
    await call('post', '/integrations/google/connect').expect(503);
    const block = (
      await call('post', '/blocks')
        .send({ startAt: at('09:00'), endAt: at('18:00'), reason: 'Día bloqueado ficticio' })
        .expect(201)
    ).body;
    await call('post', '/sessions').send(sessionBody(project.id)).expect(409);
    expect((await call('get', `/agenda/availability?date=${day}`).expect(200)).body.free).toEqual([]);
    await call('patch', `/blocks/${block.id}`)
      .send({ version: 1, active: false, startAt: at('09:00'), endAt: at('18:00'), reason: 'Día habilitado ficticio' })
      .expect(200);
    const first = (await call('post', '/sessions').send(sessionBody(project.id)).expect(201)).body;
    await call('patch', `/blocks/${block.id}`)
      .send({ version: 2, active: true, startAt: at('09:00'), endAt: at('18:00'), reason: 'Conflicto ficticio' })
      .expect(409);
    expect((await call('get', `/blocks/${block.id}`)).body).toMatchObject({ version: 2, blockActive: false });
    expect((await call('get', `/sessions/${first.id}`)).body).toEqual(first);
    expect((await call('get', '/integrations/google')).body.pendingJobs).toBe(0);
  });

  it('enforces browser-origin protection over HTTP without consuming the retry key on rejected requests', async () => {
    const key = randomUUID(),
      body = { name: 'Cliente CSRF Demo', phone: '000-demo' };
    await request(base)
      .post('/api/v1/clients')
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(403);
    await request(base)
      .post('/api/v1/clients')
      .set('Cookie', cookie)
      .set('Origin', 'https://foreign.example.test')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(403);
    await request(base)
      .get('/api/v1/auth/profile')
      .set('Cookie', cookie)
      .set('Origin', 'https://foreign.example.test')
      .expect(403);
    const preflight = await request(base)
      .options('/api/v1/clients')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,idempotency-key')
      .expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(origin);
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    const created = (await call('post', '/clients', key).send(body).expect(201)).body;
    const replay = (await call('post', '/clients', key).send(body).expect(201)).body;
    expect(replay).toEqual(created);
    const audit = (await call('get', `/audit?entityType=client&entityId=${created.id}`).expect(200)).body;
    expect(audit).toHaveLength(1);
    expect((await call('get', '/clients')).body).toHaveLength(1);
  });

  it('replays a command response after later edits without applying the old command again', async () => {
    await configure();
    const { project } = await clientAndProject();
    const first = (await call('post', '/sessions').send(sessionBody(project.id)).expect(201)).body;
    const key = randomUUID(),
      move = { version: 1, startAt: at('11:30'), endAt: at('12:30'), reason: 'Reintento ficticio' };
    const moved = (await call('post', `/sessions/${first.id}/reschedule`, key).send(move).expect(201)).body;
    const confirmed = (await call('post', `/sessions/${first.id}/confirm`).send({ version: 2 }).expect(201)).body;
    const replay = (
      await call('post', `/sessions/${first.id}/reschedule`, key)
        .send({ reason: move.reason, endAt: move.endAt, startAt: move.startAt, version: 1 })
        .expect(201)
    ).body;
    expect(replay).toEqual(moved);
    expect((await call('get', `/sessions/${first.id}`)).body).toEqual(confirmed);
    await call('post', `/sessions/${first.id}/reschedule`, key)
      .send({ ...move, reason: 'Otro cuerpo' })
      .expect(409);
    await call('post', `/sessions/${first.id}/reschedule`).send(move).expect(409);
    const history = await sessionHistory(first.id);
    expect(history.map((row) => row.action)).toEqual(['confirmed', 'reschedule', 'create']);
    expect(history[0].after.version).toBe(3);
  });
});
