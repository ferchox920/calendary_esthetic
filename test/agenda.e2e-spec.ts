import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { manageOwner } from '../src/modules/auth/owner-management';

describe('Private agenda (real PostgreSQL)', () => {
  let app: NestExpressApplication, db: DataSource, token: string, ownerId: string, clientId: string, projectId: string;
  const email = 'agenda-demo@example.test',
    password = 'Fictitious-agenda-password-only';
  const date = '2035-06-11'; // Monday, safely in the future. All fixtures are fictitious.
  const at = (time: string) => `${date}T${time}:00-03:00`;
  const req = (method: string, path: string, key = randomUUID()) =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key);
  const session = (start = '10:00', end = '11:00') => ({
    projectId,
    description: 'Demo session',
    startAt: at(start),
    endAt: at(end),
  });
  const windows = () =>
    Array.from({ length: 7 }, (_, i) => [
      { weekday: i + 1, localStart: '09:00', localEnd: '13:00', validFrom: '2035-01-01' },
      { weekday: i + 1, localStart: '14:00', localEnd: '18:00', validFrom: '2035-01-01' },
    ]).flat();
  const count = async (table: 'audit_event' | 'schedule_entry' | 'idempotency_record') =>
    Number((await db.query(`SELECT count(*) FROM ${table}`))[0].count);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    setupApp(app);
    await app.init();
    db = app.get(DataSource);
    expect(db.options.database).toBe('calendary_esthetic_test');
    await db.runMigrations();
    await db.query('TRUNCATE owner_account CASCADE');
    await manageOwner(db, 'init', email, password);
    ownerId = (await db.query('SELECT id FROM owner_account'))[0].id;
    token = (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(200)).body
      .credential.access_token;
  });

  beforeEach(async () => {
    await db.query('TRUNCATE client,working_window,audit_event,idempotency_record CASCADE');
    await db.query(
      `UPDATE agenda_settings SET timezone='America/Argentina/Buenos_Aires',"defaultPrepMinutes"=15,"defaultCleanupMinutes"=15,version=1 WHERE id=1`
    );
    await req('post', '/agenda/working-windows').send({ version: 1, windows: windows() }).expect(201);
    clientId = (await req('post', '/clients').send({ name: 'Cliente Demo A', phone: '000-demo-only' }).expect(201)).body
      .id;
    projectId = (await req('post', '/projects').send({ clientId, title: 'Tattoo Demo A' }).expect(201)).body.id;
  });

  afterAll(async () => {
    if (db?.isInitialized && db.options.database === 'calendary_esthetic_test') {
      await db.query('TRUNCATE client,working_window,owner_account CASCADE');
      await db.query(
        `UPDATE agenda_settings SET timezone='America/Argentina/Buenos_Aires',"defaultPrepMinutes"=15,"defaultCleanupMinutes"=15,version=1`
      );
    }
    if (app) await app.close();
  });

  it('supports a phone-only client and a project without quote, session or occupation', async () => {
    const project = (await req('get', `/projects/${projectId}`).expect(200)).body;
    expect(project).toMatchObject({ clientId, quoteAmount: null, quoteStatus: 'unevaluated', sessions: [] });
    expect(await count('schedule_entry')).toBe(0);
    const clients = (await req('get', '/clients?search=Demo&limit=1').expect(200)).body;
    expect(clients).toHaveLength(1);
    expect(clients[0].email).toBeNull();
    await req('post', '/clients').send({ name: 'No contact' }).expect(400);
    await req('patch', `/clients/${clientId}`).send({ version: 1, phone: null }).expect(400);
    await req('patch', `/projects/${projectId}`).send({ version: 1, clientId: randomUUID() }).expect(400);
  });

  it('requires idempotency keys and validated DTOs, versions and finite zoned dates', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send(session())
      .expect(400);
    for (const overrides of [
      { startAt: '2035-06-11T10:00:00' },
      { startAt: '2035-02-30T10:00:00Z' },
      { startAt: 'Infinity' },
      { endAt: at('09:00') },
      { prepMinutes: -1 },
      { prepMinutes: 1.5 },
      { startAt: '2020-01-01T10:00:00Z', endAt: '2020-01-01T11:00:00Z' },
      { sessionStatus: 'confirmed' },
    ])
      await req('post', '/sessions')
        .send({ ...session(), ...overrides })
        .expect(400);
    await req('get', '/agenda/entries?from=2035-01-01T00:00:00Z&to=2036-01-01T00:00:00Z').expect(400);
    await req('get', '/agenda/day?date=2035-02-30').expect(400);
    expect(await count('schedule_entry')).toBe(0);
  });

  it('creates two sessions of one project, returns UTC and queries occupied intersections', async () => {
    const first = (await req('post', '/sessions').send(session()).expect(201)).body;
    await req('post', '/sessions').send(session('11:30', '12:30')).expect(201);
    expect(first).toMatchObject({
      sessionStatus: 'pending',
      startAt: '2035-06-11T13:00:00.000Z',
      occupiedStartAt: '2035-06-11T12:45:00.000Z',
      occupiedEndAt: '2035-06-11T14:15:00.000Z',
      prepMinutes: 15,
      cleanupMinutes: 15,
    });
    expect((await req('get', `/projects/${projectId}`).expect(200)).body.sessions).toHaveLength(2);
    const range = (await req('get', '/agenda/entries?from=2035-06-11T12:46:00Z&to=2035-06-11T12:50:00Z').expect(200))
      .body;
    expect(range.entries).toHaveLength(1);
    expect(range.entries[0]).toMatchObject({
      id: first.id,
      clientName: 'Cliente Demo A',
      projectTitle: 'Tattoo Demo A',
    });
    const day = (await req('get', `/agenda/day?date=${date}`).expect(200)).body;
    expect(day).toMatchObject({
      timezone: 'America/Argentina/Buenos_Aires',
      from: '2035-06-11T03:00:00.000Z',
      to: '2035-06-12T03:00:00.000Z',
    });
  });

  it('allows exactly adjacent occupations but rejects margin overlap, breaks and midnight crossing', async () => {
    await req('post', '/sessions').send(session()).expect(201);
    await req('post', '/sessions').send(session('11:15', '12:00')).expect(409);
    await req('post', '/sessions').send(session('11:30', '12:00')).expect(201);
    await req('post', '/sessions').send(session('12:30', '13:00')).expect(400);
    await req('post', '/sessions').send(session('13:30', '14:30')).expect(400);
    await req('post', '/sessions')
      .send({ ...session(), startAt: at('23:30'), endAt: '2035-06-12T00:30:00-03:00' })
      .expect(400);
    await req('post', '/sessions').send(session('14:17', '15:03')).expect(201); // never round user input
  });

  it('computes availability from windows, margins, sessions and blocks', async () => {
    await req('post', '/sessions').send(session()).expect(201);
    await req('post', '/blocks')
      .send({ startAt: at('15:00'), endAt: at('16:00'), reason: 'Demo break' })
      .expect(201);
    const response = (await req('get', `/agenda/availability?date=${date}`).expect(200)).body;
    expect(response.free).toEqual([
      { startAt: '2035-06-11T12:00:00.000Z', endAt: '2035-06-11T12:45:00.000Z' },
      { startAt: '2035-06-11T14:15:00.000Z', endAt: '2035-06-11T16:00:00.000Z' },
      { startAt: '2035-06-11T17:00:00.000Z', endAt: '2035-06-11T18:00:00.000Z' },
      { startAt: '2035-06-11T19:00:00.000Z', endAt: '2035-06-11T21:00:00.000Z' },
    ]);
  });

  it('rejects incompatible blocks and availability edits, with affected IDs and no partial changes', async () => {
    const first = (await req('post', '/sessions').send(session()).expect(201)).body;
    const n = await count('audit_event');
    const block = await req('post', '/blocks')
      .send({ startAt: at('09:00'), endAt: at('18:00'), reason: 'Day off' })
      .expect(409);
    expect(block.body.conflicts[0].id).toBe(first.id);
    const windowsResult = await req('post', '/agenda/working-windows').send({ version: 2, windows: [] }).expect(409);
    expect(windowsResult.body.conflicts[0].id).toBe(first.id);
    await req('patch', '/agenda/settings').send({ version: 2, timezone: 'Asia/Tokyo' }).expect(409);
    expect((await req('get', '/agenda/settings')).body.version).toBe(2);
    expect(await count('audit_event')).toBe(n);
  });

  it('keeps copied margins when defaults change, and validates explicit margin changes', async () => {
    const first = (await req('post', '/sessions').send(session()).expect(201)).body;
    await req('patch', '/agenda/settings')
      .send({ version: 2, defaultPrepMinutes: 30, defaultCleanupMinutes: 0 })
      .expect(200);
    expect((await req('get', `/sessions/${first.id}`)).body.prepMinutes).toBe(15);
    const second = (await req('post', '/sessions').send(session('14:30', '15:30')).expect(201)).body;
    expect(second.prepMinutes).toBe(30);
    const failed = await req('post', `/sessions/${first.id}/reschedule`)
      .send({ version: 1, startAt: at('09:15'), endAt: at('10:00'), prepMinutes: 30, reason: 'Demo' })
      .expect(400);
    expect(failed.body.statusCode).toBe(400);
    expect((await req('get', `/sessions/${first.id}`)).body).toEqual(first);
  });

  it('keeps a failed reschedule intact and audits a successful move of the same ID', async () => {
    const first = (await req('post', '/sessions').send(session()).expect(201)).body;
    await req('post', '/sessions').send(session('14:30', '15:30')).expect(201);
    const n = await count('audit_event');
    await req('post', `/sessions/${first.id}/reschedule`)
      .send({ version: 1, startAt: at('14:15'), endAt: at('15:00'), reason: 'Conflict demo' })
      .expect(409);
    expect((await req('get', `/sessions/${first.id}`)).body).toEqual(first);
    expect(await count('audit_event')).toBe(n);
    const moved = (
      await req('post', `/sessions/${first.id}/reschedule`)
        .send({ version: 1, startAt: at('11:30'), endAt: at('12:30'), reason: 'New time' })
        .expect(201)
    ).body;
    expect(moved).toMatchObject({ id: first.id, version: 2 });
    const audit = (await req('get', `/audit?entityType=session&entityId=${first.id}`).expect(200)).body;
    expect(audit[0]).toMatchObject({
      actorId: ownerId,
      action: 'reschedule',
      reason: 'New time',
      before: { startAt: first.startAt },
      after: { startAt: moved.startAt },
    });
  });

  it('serializes parallel creates: one succeeds and one conflicts', async () => {
    const results = await Promise.all([
      req('post', '/sessions').send(session()),
      req('post', '/sessions').send(session()),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await count('schedule_entry')).toBe(1);
    expect((await db.query(`SELECT count(*) FROM audit_event WHERE "entityType"='session'`))[0].count).toBe('1');
  });

  it('returns the same result for concurrent retries and rejects a reused key with changed payload', async () => {
    const key = randomUUID();
    const results = await Promise.all([
      req('post', '/sessions', key).send(session()),
      req('post', '/sessions', key).send(session()),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body).toEqual(results[1].body);
    expect(await count('schedule_entry')).toBe(1);
    await req('post', '/sessions', key).send(session('11:30', '12:30')).expect(409);
    const keys = await count('idempotency_record');
    await req('post', '/sessions', key).send(session()).expect(201);
    expect(await count('idempotency_record')).toBe(keys);
  });

  it('rejects stale versions when two tabs reschedule the same session', async () => {
    const first = (await req('post', '/sessions').send(session()).expect(201)).body;
    const results = await Promise.all([
      req('post', `/sessions/${first.id}/reschedule`).send({
        version: 1,
        startAt: at('11:30'),
        endAt: at('12:30'),
        reason: 'Tab A',
      }),
      req('post', `/sessions/${first.id}/reschedule`).send({
        version: 1,
        startAt: at('14:30'),
        endAt: at('15:30'),
        reason: 'Tab B',
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await req('get', `/sessions/${first.id}`)).body.version).toBe(2);
  });

  it('cancels without deletion, frees space and requires revalidation to reactivate', async () => {
    const first = (await req('post', '/sessions').send(session()).expect(201)).body;
    await req('post', `/sessions/${first.id}/cancel`).send({ version: 1, reason: 'Demo cancellation' }).expect(201);
    expect((await req('get', `/sessions/${first.id}`)).body.sessionStatus).toBe('canceled');
    await req('post', '/sessions').send(session()).expect(201);
    await req('post', `/sessions/${first.id}/correct-status`)
      .send({ version: 2, status: 'pending', reason: 'Demo reactivation' })
      .expect(409);
    await req('post', `/sessions/${first.id}/confirm`).send({ version: 2 }).expect(409);
    await req('delete', `/sessions/${first.id}`).expect(404);
    expect(await count('schedule_entry')).toBe(2);
  });

  it('allows explicit confirmation, prevents premature completion and validates terminal corrections', async () => {
    const first = (await req('post', '/sessions').send(session()).expect(201)).body;
    await req('post', `/sessions/${first.id}/complete`).send({ version: 1 }).expect(409);
    await req('post', `/sessions/${first.id}/confirm`).send({ version: 1 }).expect(201);
    await req('post', `/sessions/${first.id}/complete`).send({ version: 2 }).expect(400);
    await req('post', `/sessions/${first.id}/absent`).send({ version: 2 }).expect(400);
    // Controlled historical fixture; normal API never imports historical sessions.
    await db.query(
      `UPDATE schedule_entry SET "startAt"="startAt"-interval '30 years',"endAt"="endAt"-interval '30 years',
      "occupiedStartAt"="occupiedStartAt"-interval '30 years',"occupiedEndAt"="occupiedEndAt"-interval '30 years' WHERE id=$1`,
      [first.id]
    );
    await req('post', `/sessions/${first.id}/complete`).send({ version: 2 }).expect(201);
    await req('post', `/sessions/${first.id}/confirm`).send({ version: 3 }).expect(409);
    await req('post', `/sessions/${first.id}/correct-status`)
      .send({ version: 3, status: 'absent', reason: 'Corrected attendance' })
      .expect(201);
    await req('post', `/sessions/${first.id}/correct-status`)
      .send({ version: 4, status: 'pending', reason: 'Cannot reactivate past' })
      .expect(400);
  });

  it('deactivates blocks and rechecks conflicts before reactivation', async () => {
    const block = (
      await req('post', '/blocks')
        .send({ startAt: at('09:00'), endAt: at('18:00'), reason: 'Day off' })
        .expect(201)
    ).body;
    await req('post', '/sessions').send(session()).expect(409);
    await req('patch', `/blocks/${block.id}`)
      .send({ version: 1, active: false, startAt: at('09:00'), endAt: at('18:00'), reason: 'Available again' })
      .expect(200);
    await req('post', '/sessions').send(session()).expect(201);
    await req('patch', `/blocks/${block.id}`)
      .send({ version: 2, active: true, startAt: at('09:00'), endAt: at('18:00'), reason: 'Day off' })
      .expect(409);
    expect((await req('get', `/blocks/${block.id}`)).body.blockActive).toBe(false);
  });

  it('rejects new sessions for archived clients/projects and stale client edits', async () => {
    const updated = (
      await req('patch', `/clients/${clientId}`).send({ version: 1, name: 'Cliente Demo B' }).expect(200)
    ).body;
    expect(updated).toMatchObject({ id: clientId, name: 'Cliente Demo B', version: 2 });
    await req('patch', `/clients/${clientId}`).send({ version: 1, name: 'Old tab' }).expect(409);
    await req('post', `/clients/${clientId}/archive`).send({ version: 2 }).expect(201);
    await req('post', '/sessions').send(session()).expect(409);
    await req('post', '/projects').send({ clientId, title: 'New demo' }).expect(409);
    expect((await req('get', `/clients/${clientId}`)).body.archivedAt).toBeTruthy();
  });

  it('rolls back the occupation, idempotency key and audit when an audit insert fails', async () => {
    const queryRunner = db.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(
      `CREATE FUNCTION test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$`
    );
    await queryRunner.query(
      'CREATE TRIGGER test_reject_audit BEFORE INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION test_reject_audit()'
    );
    const audits = await count('audit_event'),
      keys = await count('idempotency_record');
    try {
      await req('post', '/sessions').send(session()).expect(500);
      expect(await count('schedule_entry')).toBe(0);
      expect(await count('audit_event')).toBe(audits);
      expect(await count('idempotency_record')).toBe(keys);
    } finally {
      await queryRunner.query('DROP TRIGGER test_reject_audit ON audit_event');
      await queryRunner.query('DROP FUNCTION test_reject_audit()');
      await queryRunner.release();
    }
  });

  it('enforces exclusion on two independent SQL connections even when API checks are bypassed', async () => {
    const a = db.createQueryRunner(),
      b = db.createQueryRunner();
    await a.connect();
    await b.connect();
    const sql = `INSERT INTO schedule_entry (kind,"startAt","endAt","occupiedStartAt","occupiedEndAt","prepMinutes","cleanupMinutes",reason,"blockActive")
      VALUES ('block',$1,$2,$1,$2,0,0,'SQL demo',true) RETURNING id`;
    await a.startTransaction();
    await b.startTransaction();
    try {
      await a.query(sql, [at('10:00'), at('11:00')]);
      const pending = b.query(sql, [at('10:30'), at('11:30')]).then(
        () => null,
        (error) => error.driverError.code
      );
      await a.commitTransaction();
      expect(await pending).toBe('23P01');
      await b.rollbackTransaction();
      await req('post', '/sessions').send(session()).expect(409); // same exclusion spans sessions and blocks
    } finally {
      if (a.isTransactionActive) await a.rollbackTransaction();
      if (b.isTransactionActive) await b.rollbackTransaction();
      await a.release();
      await b.release();
    }
  });

  it('rejects malformed occupations at database level', async () => {
    const sql = `INSERT INTO schedule_entry (kind,"startAt","endAt","occupiedStartAt","occupiedEndAt","prepMinutes","cleanupMinutes",reason,"blockActive")
      VALUES ('block',$1,$2,$3,$4,0,0,'SQL demo',true)`;
    await expect(db.query(sql, [at('10:00'), at('11:00'), at('09:00'), at('11:00')])).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    await expect(db.query(sql, ['-infinity', 'infinity', '-infinity', 'infinity'])).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    await expect(
      db.query(
        `INSERT INTO schedule_entry (kind,"startAt","endAt","occupiedStartAt","occupiedEndAt","prepMinutes","cleanupMinutes","projectId",description)
      VALUES ('session',$1,$2,$1,$2,0,0,$3,'Demo')`,
        [at('10:00'), at('11:00'), projectId]
      )
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
  });

  it('retains past windows when replacing future availability', async () => {
    await db.query(
      `INSERT INTO working_window ("agendaId",weekday,"localStart","localEnd","validFrom") VALUES (1,1,'08:00','09:00','2020-01-01')`
    );
    await req('post', '/agenda/working-windows').send({ version: 2, windows: windows() }).expect(201);
    const old = (await db.query(`SELECT "validTo"::text FROM working_window WHERE "validFrom"='2020-01-01'`))[0];
    expect(old.validTo).toBeTruthy();
    await req('post', '/agenda/working-windows')
      .send({ version: 3, windows: [{ weekday: 1, localStart: '09:00', localEnd: '18:00', validFrom: '2020-01-01' }] })
      .expect(400);
  });

  it('preserves legacy consultation reads and retires their write routes', async () => {
    const [legacy] = await db.query(
      `INSERT INTO consultation (status,date) VALUES ('scheduled','2035-06-11T10:00:00') RETURNING *`
    );
    try {
      expect((await req('get', `/consultation/${legacy.id}`).expect(200)).body.id).toBe(legacy.id);
      await req('post', '/consultation')
        .send({
          status: 'scheduled',
          date: at('10:00'),
          linkpay: '',
          professionalId: randomUUID(),
          activityId: randomUUID(),
          userId: randomUUID(),
        })
        .expect(410);
      await req('patch', `/consultation/${legacy.id}`)
        .send({ date: at('11:00') })
        .expect(410);
      await req('delete', `/consultation/${legacy.id}`).expect(410);
      expect((await db.query('SELECT * FROM consultation WHERE id=$1', [legacy.id]))[0]).toEqual(legacy);
    } finally {
      await db.query('DELETE FROM consultation WHERE id=$1', [legacy.id]);
    }
  });

  it('serializes competing blocks and sessions across the same agenda', async () => {
    const results = await Promise.all([
      req('post', '/sessions').send(session()),
      req('post', '/blocks').send({ startAt: at('09:00'), endAt: at('18:00'), reason: 'Concurrent day off' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await count('schedule_entry')).toBe(1);
  });

  it('queries an entire local day across DST with the correct 23-hour boundary', async () => {
    await req('patch', '/agenda/settings').send({ version: 2, timezone: 'America/New_York' }).expect(200);
    await req('post', '/blocks')
      .send({ startAt: '2030-03-10T00:00:00-05:00', endAt: '2030-03-11T00:00:00-04:00', reason: 'DST day off demo' })
      .expect(201);
    const day = (await req('get', '/agenda/day?date=2030-03-10').expect(200)).body;
    expect(day.entries).toHaveLength(1);
    expect(new Date(day.to).getTime() - new Date(day.from).getTime()).toBe(23 * 3600000);
    expect(day.timezone).toBe('America/New_York');
  });

  it('keeps projects editable and prevents archiving while future sessions still need attention', async () => {
    const updated = (
      await req('patch', `/projects/${projectId}`).send({ version: 1, title: 'Updated Demo Tattoo' }).expect(200)
    ).body;
    expect(updated).toMatchObject({ id: projectId, title: 'Updated Demo Tattoo', version: 2 });
    const first = (await req('post', '/sessions').send(session()).expect(201)).body;
    await req('post', `/projects/${projectId}/archive`).send({ version: 2 }).expect(409);
    await req('post', `/clients/${clientId}/archive`).send({ version: 1 }).expect(409);
    await req('post', `/sessions/${first.id}/cancel`)
      .send({ version: 1, reason: 'Cancel before archiving' })
      .expect(201);
    const archived = (await req('post', `/projects/${projectId}/archive`).send({ version: 2 }).expect(201)).body;
    expect(archived).toMatchObject({ id: projectId, version: 3 });
    expect(archived.archivedAt).toBeTruthy();
  });
});
