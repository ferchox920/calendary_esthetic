import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { manageOwner } from '../src/modules/auth/owner-management';
import { ReminderClock, ReminderWorker } from '../src/modules/reminders/reminder-worker.service';
import { ReminderNotAccepted, ReminderProvider } from '../src/modules/reminders/reminder-provider';
import { reconcileReminders } from '../src/modules/reminders/reminder-planner';

describe('Persistent reminders (PostgreSQL, simulated network only)', () => {
  let app: NestExpressApplication,
    db: DataSource,
    worker: ReminderWorker,
    token: string,
    clientId: string,
    projectId: string;
  let now: Date;
  const clock = { now: () => new Date(now) };
  const fake = {
    name: 'simulated',
    available: jest.fn(() => true),
    send: jest.fn(async (_message: any): Promise<{ accepted: true; messageId: string }> => ({
      accepted: true,
      messageId: 'fictitious-message',
    })),
  };
  const email = 'reminder-owner@example.test',
    password = 'Fictitious-reminder-test-password';
  const req = (method: string, path: string, key = randomUUID()) =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key);
  const config = (overrides: any = {}) => ({
    version: 1,
    enabled: true,
    rules: [
      { leadMinutes: 1440, template: 'Turno {{date}} {{time}}' },
      { leadMinutes: 120, template: 'Turno {{date}} {{time}}' },
    ],
    allowedStart: '09:00',
    allowedEnd: '20:00',
    graceMinutes: 30,
    maxAttempts: 3,
    ...overrides,
  });
  async function enable() {
    await req('patch', '/reminders/settings').send(config()).expect(200);
  }
  async function consent(overrides: any = {}) {
    return (
      await req('patch', `/clients/${clientId}/reminders`)
        .send({
          version: 0,
          enabled: true,
          phoneE164: '+5491100000000',
          consentAccepted: true,
          consentSource: 'fictitious in-person acceptance',
          ...overrides,
        })
        .expect(200)
    ).body;
  }
  async function book(start = '2035-06-11T10:00:00-03:00', end = '2035-06-11T11:00:00-03:00', confirm = true) {
    const entry = (
      await req('post', '/sessions')
        .send({ projectId, description: 'Private project details', startAt: start, endAt: end })
        .expect(201)
    ).body;
    return confirm
      ? (await req('post', `/sessions/${entry.id}/confirm`).send({ version: entry.version }).expect(201)).body
      : entry;
  }
  const jobs = () => db.query('SELECT * FROM reminder_job ORDER BY "scheduledAt",id');
  const otherWorker = () => new ReminderWorker(db, fake, clock);
  const defer = () => {
    let resolve: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve: () => resolve() };
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ReminderProvider)
      .useValue(fake)
      .overrideProvider(ReminderClock)
      .useValue(clock)
      .compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    setupApp(app);
    await app.init();
    db = app.get(DataSource);
    worker = app.get(ReminderWorker);
    expect(db.options.database).toBe('calendary_esthetic_test');
    await db.runMigrations();
  });
  beforeEach(async () => {
    now = new Date('2035-06-10T13:00:00Z');
    fake.send.mockReset().mockResolvedValue({ accepted: true, messageId: 'fictitious-message' });
    fake.available.mockReturnValue(true);
    await db.query('TRUNCATE owner_account,client,working_window CASCADE');
    await db.query(
      `UPDATE agenda_settings SET timezone='America/Argentina/Buenos_Aires',version=1,"defaultPrepMinutes"=0,"defaultCleanupMinutes"=0`
    );
    await db.query(
      `UPDATE reminder_settings SET enabled=false,version=1,rules=$1,"allowedStart"='09:00',"allowedEnd"='20:00',"graceMinutes"=30,"maxAttempts"=3`,
      [JSON.stringify(config().rules)]
    );
    await manageOwner(db, 'init', email, password);
    token = (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(200)).body
      .credential.access_token;
    await req('post', '/agenda/working-windows')
      .send({
        version: 1,
        windows: Array.from({ length: 7 }, (_, i) => ({
          weekday: i + 1,
          localStart: '00:00',
          localEnd: '23:59',
          validFrom: '2035-01-01',
        })),
      })
      .expect(201);
    clientId = (
      await req('post', '/clients').send({ name: 'Fictitious reminder client', phone: 'legacy-free-text' }).expect(201)
    ).body.id;
    projectId = (await req('post', '/projects').send({ clientId, title: 'Private demo project' }).expect(201)).body.id;
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query('TRUNCATE owner_account,client,working_window CASCADE');
      await db.query('UPDATE reminder_settings SET enabled=false,version=1');
    }
    if (app) await app.close();
  });

  it('is opt-in and requires authenticated, idempotent, versioned writes and valid policies', async () => {
    await request(app.getHttpServer()).get('/api/v1/reminders/history').expect(401);
    expect((await req('get', '/reminders/settings').expect(200)).body.enabled).toBe(false);
    await book();
    expect(await jobs()).toHaveLength(0);
    await req('patch', `/clients/${clientId}/reminders`)
      .send({ version: 0, enabled: true, phoneE164: '+5491100000000' })
      .expect(400);
    await req('patch', `/clients/${clientId}/reminders`)
      .send({ version: 0, enabled: true, phoneE164: '011111', consentAccepted: true, consentSource: 'demo' })
      .expect(400);
    for (const overrides of [
      { allowedEnd: '08:00' },
      { rules: [{ leadMinutes: 1440, template: '{{name}}' }] },
      {
        rules: [
          { leadMinutes: 1, template: 'a' },
          { leadMinutes: 1, template: 'b' },
        ],
      },
      { maxAttempts: 0 },
      { enabled: null },
    ])
      await req('patch', '/reminders/settings').send(config(overrides)).expect(400);
    const key = randomUUID();
    const first = await req('patch', '/reminders/settings', key).send(config()).expect(200);
    expect((await req('patch', '/reminders/settings', key).send(config()).expect(200)).body).toEqual(first.body);
    await req('patch', '/reminders/settings', key)
      .send(config({ enabled: false }))
      .expect(409);
    await req('patch', '/reminders/settings').send(config()).expect(409);
    await request(app.getHttpServer())
      .patch('/api/v1/reminders/settings')
      .set('Authorization', `Bearer ${token}`)
      .send(config())
      .expect(400);
  });
  it('queues only confirmed sessions after consent and updates pending jobs atomically on reschedule/cancel', async () => {
    await enable();
    await consent();
    const entry = await book(undefined, undefined, false);
    expect(await jobs()).toHaveLength(0);
    const confirmed = (await req('post', `/sessions/${entry.id}/confirm`).send({ version: entry.version }).expect(201))
      .body;
    expect(await jobs()).toHaveLength(2);
    const changed = (
      await req('post', `/sessions/${entry.id}/reschedule`)
        .send({
          version: confirmed.version,
          startAt: '2035-06-12T10:00:00-03:00',
          endAt: '2035-06-12T11:00:00-03:00',
          reason: 'Demo change',
        })
        .expect(201)
    ).body;
    const rows = await jobs();
    expect(rows.filter((j) => j.state === 'canceled')).toHaveLength(2);
    expect(rows.filter((j) => j.state === 'pending').map((j) => j.scheduledAt.toISOString())).toEqual([
      '2035-06-11T13:00:00.000Z',
      '2035-06-12T12:00:00.000Z',
    ]);
    expect(changed.reminderGeneration).toBe(2);
    await req('post', `/sessions/${entry.id}/cancel`)
      .send({ version: changed.version, reason: 'Demo cancel' })
      .expect(201);
    now = new Date('2035-06-11T13:00:00Z');
    await worker.runOnce();
    expect(fake.send).not.toHaveBeenCalled();
    expect((await jobs()).every((j) => j.state === 'canceled')).toBe(true);
  });
  it.each(['global', 'client', 'session', 'consent'])('suppresses jobs after %s disabling', async (kind) => {
    await enable();
    await consent();
    const entry = await book();
    if (kind === 'global')
      await req('patch', '/reminders/settings')
        .send(config({ version: 2, enabled: false }))
        .expect(200);
    if (kind === 'client' || kind === 'consent')
      await req('patch', `/clients/${clientId}/reminders`)
        .send({ version: 1, enabled: false, ...(kind === 'consent' ? { consentAccepted: false } : {}) })
        .expect(200);
    if (kind === 'session')
      await req('patch', `/sessions/${entry.id}/reminders`)
        .send({ version: entry.version, disabled: true })
        .expect(200);
    await worker.runOnce();
    expect(fake.send).not.toHaveBeenCalled();
    expect((await jobs()).every((j) => j.state === 'canceled')).toBe(true);
  });
  it('requires fresh acceptance for a changed destination and keeps phones/messages out of audit and history', async () => {
    await enable();
    await consent();
    const entry = await book();
    await req('patch', `/clients/${clientId}/reminders`)
      .send({ version: 1, enabled: true, phoneE164: '+5491100000001' })
      .expect(400);
    await req('patch', `/clients/${clientId}/reminders`)
      .send({
        version: 1,
        enabled: true,
        phoneE164: '+5491100000001',
        consentAccepted: true,
        consentSource: 'new fictitious acceptance',
      })
      .expect(200);
    await worker.runOnce();
    expect(fake.send).toHaveBeenCalledWith(
      expect.objectContaining({ phoneE164: '+5491100000001', text: 'Turno 11/06/2035 10:00' })
    );
    const history = (await req('get', `/reminders/history?entryId=${entry.id}&state=sent&limit=1`).expect(200)).body;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ state: 'sent', provider: 'simulated', attempts: 1 });
    const audit = (await req('get', '/audit?entityType=reminder').expect(200)).body;
    for (const data of [history, audit, (await req('get', `/clients/${clientId}/reminders`).expect(200)).body]) {
      expect(JSON.stringify(data)).not.toContain('+549110000000');
      expect(JSON.stringify(data)).not.toContain('Turno 11/06/2035');
      expect(JSON.stringify(data)).not.toContain('lockToken');
    }
    await req('get', '/reminders/history?state=wrong').expect(400);
  });
  it('defers quiet-hour reminders and omits reminders whose window starts at/after the appointment', async () => {
    await enable();
    await consent();
    await book('2035-06-11T08:00:00-03:00', '2035-06-11T09:00:00-03:00');
    const rows = await jobs();
    expect(rows[0].scheduledAt.toISOString()).toBe('2035-06-10T12:00:00.000Z');
    expect(rows[1]).toMatchObject({ state: 'canceled', reason: 'no_allowed_window' });
    now = new Date('2035-06-10T11:00:00Z');
    await worker.runOnce();
    expect(fake.send).not.toHaveBeenCalled();
    now = new Date('2035-06-10T12:00:00Z');
    await worker.runOnce();
    expect(fake.send).toHaveBeenCalledTimes(1);
  });
  it('omits late confirmations, expired downtime work and past appointments', async () => {
    await enable();
    await consent();
    const entry = await book();
    await db.query('DELETE FROM reminder_job');
    now = new Date('2035-06-11T10:30:00Z');
    await db.transaction(async (m) => {
      await m.query('SELECT id FROM agenda_settings FOR UPDATE');
      await reconcileReminders(m, entry.id, now);
    });
    expect((await jobs())[0]).toMatchObject({ state: 'canceled', reason: 'confirmed_too_late' });
    expect((await jobs())[1].state).toBe('pending');
    now = new Date('2035-06-11T12:31:00Z');
    await worker.runOnce();
    expect(fake.send).not.toHaveBeenCalled();
    expect((await jobs())[1]).toMatchObject({ state: 'canceled', reason: 'expired' });
    await db.query(`UPDATE reminder_job SET state='pending',"scheduledAt"=$1,"nextAttemptAt"=$1,"expiresAt"=$2`, [
      new Date('2035-06-11T14:00:00Z'),
      new Date('2035-06-11T15:00:00Z'),
    ]);
    now = new Date('2035-06-11T14:00:00Z');
    await worker.runOnce();
    expect(fake.send).not.toHaveBeenCalled();
  });
  it('recalculates timezone and templates without resending a successful reminder', async () => {
    await enable();
    await consent();
    await book();
    await worker.runOnce();
    await req('patch', '/agenda/settings').send({ version: 2, timezone: 'America/New_York' }).expect(200);
    await req('patch', '/reminders/settings')
      .send(
        config({
          version: 2,
          allowedStart: '06:00',
          rules: config().rules.map((r) => ({ ...r, template: 'Nueva {{time}}' })),
        })
      )
      .expect(200);
    expect((await jobs()).find((j) => j.state === 'sent')).toBeDefined();
    const pending = (await jobs()).find((j) => j.state === 'pending');
    expect(pending.timezone).toBe('America/New_York');
    now = pending.scheduledAt;
    await worker.runOnce();
    expect(fake.send).toHaveBeenCalledTimes(2);
    expect(fake.send.mock.calls[1][0].text).toBe('Nueva 09:00');
  });
  it('bounds proven non-acceptance retries and treats all other errors as uncertain', async () => {
    await enable();
    await consent();
    await book();
    fake.send.mockRejectedValue(new ReminderNotAccepted(true));
    await worker.runOnce();
    expect((await jobs())[0]).toMatchObject({ state: 'pending', attempts: 1 });
    now = new Date(now.getTime() + 15000);
    await otherWorker().runOnce();
    now = new Date(now.getTime() + 30000);
    await worker.runOnce();
    expect((await jobs())[0]).toMatchObject({ state: 'failed', attempts: 3 });
    now = new Date('2035-06-11T12:00:00Z');
    fake.send.mockRejectedValue(new Error('unknown network result with secret payload'));
    await worker.runOnce();
    expect((await jobs())[1]).toMatchObject({ state: 'uncertain', attempts: 1, reason: 'acceptance_unknown' });
    await otherWorker().runOnce();
    expect(fake.send).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(await jobs())).not.toContain('secret payload');
  });
  it('recovers leases before dispatch, but never repeats interrupted started attempts', async () => {
    await enable();
    await consent();
    await book();
    const [first] = await jobs();
    const lock = randomUUID();
    await db.query(`UPDATE reminder_job SET state='processing',"lockToken"=$2,"lockedUntil"=$3 WHERE id=$1`, [
      first.id,
      lock,
      new Date(now.getTime() - 1),
    ]);
    await otherWorker().runOnce();
    expect(fake.send).toHaveBeenCalledTimes(1);
    const second = (await jobs())[1];
    now = second.scheduledAt;
    await db.query(
      `UPDATE reminder_job SET state='processing',attempts=1,"dispatchStartedAt"=$2,"lockedUntil"=$3,"lockToken"=$4 WHERE id=$1`,
      [second.id, now, new Date(now.getTime() - 1), randomUUID()]
    );
    await db.query(
      `INSERT INTO reminder_attempt (id,"jobId",number,provider,"startedAt") VALUES ($1,$2,1,'simulated',$3)`,
      [randomUUID(), second.id, now]
    );
    await worker.runOnce();
    expect(fake.send).toHaveBeenCalledTimes(1);
    expect((await jobs())[1].state).toBe('uncertain');
    expect((await db.query('SELECT outcome FROM reminder_attempt WHERE "jobId"=$1', [second.id]))[0].outcome).toBe(
      'uncertain'
    );
  });
  it('does not duplicate an in-flight send across workers and allows cancellation without a network transaction', async () => {
    await enable();
    await consent();
    const entry = await book();
    const started = defer(),
      release = defer();
    fake.send.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
      return { accepted: true, messageId: 'fictitious-inflight' };
    });
    const processing = worker.runOnce(1);
    await started.promise;
    try {
      await otherWorker().runOnce();
      expect(fake.send).toHaveBeenCalledTimes(1);
      await req('post', `/sessions/${entry.id}/cancel`)
        .send({ version: entry.version, reason: 'Demo cancellation in flight' })
        .expect(201);
    } finally {
      release.resolve();
      await processing;
    }
    expect((await jobs()).map((j) => j.state)).toEqual(['sent', 'canceled']);
  });
  it('rechecks cancellation between claim and dispatch', async () => {
    await enable();
    await consent();
    const entry = await book();
    const claim = await (worker as any).claim();
    await req('post', `/sessions/${entry.id}/cancel`)
      .send({ version: entry.version, reason: 'Demo before dispatch' })
      .expect(201);
    expect(await (worker as any).begin(claim)).toBeNull();
    expect(fake.send).not.toHaveBeenCalled();
  });
  it('rolls back confirmation, jobs, audit and idempotency when auditing fails', async () => {
    await enable();
    await consent();
    const entry = await book(undefined, undefined, false);
    const before = (await db.query('SELECT count(*) FROM idempotency_record'))[0].count;
    await db.query(
      `CREATE FUNCTION reminders_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fictitious failure'; END $$`
    );
    await db.query(
      'CREATE TRIGGER reminders_test_fail BEFORE INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION reminders_test_fail()'
    );
    try {
      await req('post', `/sessions/${entry.id}/confirm`).send({ version: entry.version }).expect(500);
    } finally {
      await db.query('DROP TRIGGER reminders_test_fail ON audit_event');
      await db.query('DROP FUNCTION reminders_test_fail()');
    }
    expect(await jobs()).toHaveLength(0);
    expect((await req('get', `/sessions/${entry.id}`).expect(200)).body.sessionStatus).toBe('pending');
    expect((await db.query('SELECT count(*) FROM idempotency_record'))[0].count).toBe(before);
  });
  it('keeps accepted-but-unrecorded sends uncertain after a database interruption', async () => {
    await enable();
    await consent();
    await book();
    await db.query(`CREATE FUNCTION reminders_test_finish_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.state='sent' THEN RAISE EXCEPTION 'fictitious finish failure'; END IF; RETURN NEW; END $$`);
    await db.query(
      'CREATE TRIGGER reminders_test_finish_fail BEFORE UPDATE ON reminder_job FOR EACH ROW EXECUTE FUNCTION reminders_test_finish_fail()'
    );
    try {
      await expect(worker.runOnce()).rejects.toThrow();
    } finally {
      await db.query('DROP TRIGGER reminders_test_finish_fail ON reminder_job');
      await db.query('DROP FUNCTION reminders_test_finish_fail()');
    }
    expect((await jobs())[0].state).toBe('processing');
    now = new Date(now.getTime() + 61000);
    await otherWorker().runOnce();
    expect((await jobs())[0].state).toBe('uncertain');
    expect(fake.send).toHaveBeenCalledTimes(1);
  });
  it('retains persistent jobs while the provider is unavailable', async () => {
    await enable();
    await consent();
    await book();
    fake.available.mockReturnValue(false);
    await worker.runOnce();
    expect(fake.send).not.toHaveBeenCalled();
    expect((await jobs())[0].state).toBe('pending');
    fake.available.mockReturnValue(true);
    await otherWorker().runOnce();
    expect((await jobs())[0].state).toBe('sent');
  });

  it('serializes two simultaneous workers and keeps successful reminders terminal through preference toggles', async () => {
    await enable();
    await consent();
    const entry = await book();
    await Promise.all([worker.runOnce(), otherWorker().runOnce()]);
    expect(fake.send).toHaveBeenCalledTimes(1);
    await req('patch', `/sessions/${entry.id}/reminders`).send({ version: entry.version, disabled: true }).expect(200);
    await req('patch', `/sessions/${entry.id}/reminders`)
      .send({ version: entry.version + 1, disabled: false })
      .expect(200);
    await worker.runOnce();
    expect(fake.send).toHaveBeenCalledTimes(1);
    expect((await jobs())[0].state).toBe('sent');
    expect((await jobs())[1].state).toBe('pending');
  });

  it('preserves queued reminders when rescheduling fails and rebuilds them after explicit reactivation', async () => {
    await enable();
    await consent();
    const entry = await book();
    await book('2035-06-11T12:00:00-03:00', '2035-06-11T13:00:00-03:00', false);
    const before = await jobs();
    await req('post', `/sessions/${entry.id}/reschedule`)
      .send({
        version: entry.version,
        startAt: '2035-06-11T12:00:00-03:00',
        endAt: '2035-06-11T13:00:00-03:00',
        reason: 'Demo conflict',
      })
      .expect(409);
    expect(await jobs()).toEqual(before);
    const canceled = (
      await req('post', `/sessions/${entry.id}/cancel`)
        .send({ version: entry.version, reason: 'Demo cancel' })
        .expect(201)
    ).body;
    const restored = (
      await req('post', `/sessions/${entry.id}/correct-status`)
        .send({ version: canceled.version, status: 'confirmed', reason: 'Explicit fictitious reactivation' })
        .expect(201)
    ).body;
    expect(restored.reminderGeneration).toBe(2);
    expect((await jobs()).filter((j) => j.state === 'pending')).toHaveLength(2);
  });

  it('blocks a claimed job when settings change before dispatch', async () => {
    await enable();
    await consent();
    await book();
    const claim = await (worker as any).claim();
    await req('patch', '/reminders/settings')
      .send(config({ version: 2, enabled: false }))
      .expect(200);
    expect(await (worker as any).begin(claim)).toBeNull();
    expect(fake.send).not.toHaveBeenCalled();
  });

  it('does not send retries across the end of a permitted window', async () => {
    await req('patch', '/reminders/settings')
      .send(config({ rules: [{ leadMinutes: 1440, template: 'Demo {{time}}' }] }))
      .expect(200);
    await consent();
    await book('2035-06-11T19:59:00-03:00', '2035-06-11T20:59:00-03:00');
    now = new Date('2035-06-10T22:59:50Z');
    fake.send.mockRejectedValue(new ReminderNotAccepted(true));
    await worker.runOnce();
    expect(fake.send).toHaveBeenCalledTimes(1);
    now = new Date(now.getTime() + 15000);
    await otherWorker().runOnce();
    expect(fake.send).toHaveBeenCalledTimes(1);
    expect((await jobs())[0]).toMatchObject({ state: 'canceled', reason: 'no_allowed_window' });
  });

  it('fences late acknowledgements after another worker recovered an expired lease', async () => {
    await enable();
    await consent();
    await book();
    const started = defer(),
      release = defer();
    fake.send.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
      return { accepted: true, messageId: 'late-demo' };
    });
    const processing = worker.runOnce(1);
    await started.promise;
    try {
      now = new Date(now.getTime() + 61000);
      await otherWorker().runOnce();
      expect((await jobs())[0].state).toBe('uncertain');
      expect(fake.send).toHaveBeenCalledTimes(1);
    } finally {
      release.resolve();
      await processing;
    }
    expect((await jobs())[0].state).toBe('uncertain');
    expect((await db.query('SELECT outcome FROM reminder_attempt'))[0].outcome).toBe('uncertain');
  });
});
