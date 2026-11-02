import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { manageOwner } from '../src/modules/auth/owner-management';
import { WhatsAppGateway } from '../src/modules/reminders/whatsapp.gateway';
import { authConfig } from '../src/modules/auth/auth-config';

describe('Private WhatsApp lifecycle (simulated bridge only)', () => {
  let app: NestExpressApplication, db: DataSource, token: string;
  const commands = new Map<string, any>(),
    challenges = new Map<string, any>();
  const fake = {
    ensureConfigured: jest.fn(),
    status: jest.fn(),
    command: jest.fn(async (body: any): Promise<any> => {
      const result = {
        commandId: body.commandId,
        state: 'completed',
        ...(body.action === 'link' ? { linkId: body.commandId } : {}),
        ...(body.action === 'disconnect' ? { remoteLogout: 'requested' } : {}),
      };
      commands.set(body.commandId, result);
      if (body.action === 'link')
        challenges.set(body.commandId, {
          id: body.commandId,
          mode: body.mode,
          state: 'ready',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          ...(body.mode === 'code' ? { code: '1234-5678' } : { qrDataUrl: 'data:image/png;base64,ZmFrZQ==' }),
          phoneE164: body.phoneE164,
          credentials: 'private-fictitious-secret',
        });
      return { ...result, code: '1234-5678', phoneE164: body.phoneE164, credentials: 'private-fictitious-secret' };
    }),
    receipt: jest.fn(async (id: string) => {
      if (!commands.has(id)) throw new NotFoundException();
      return commands.get(id);
    }),
    challenge: jest.fn(async (id: string) => {
      if (!challenges.has(id)) throw new NotFoundException();
      return challenges.get(id);
    }),
  };
  const req = (method: string, path: string, key = randomUUID()) =>
    request(app.getHttpServer())
      [method](`/api/v1/integrations/whatsapp${path}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WhatsAppGateway)
      .useValue(fake)
      .compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    setupApp(app);
    await app.init();
    db = app.get(DataSource);
    expect(db.options.database).toBe('calendary_esthetic_test');
    await db.runMigrations();
  });
  beforeEach(async () => {
    commands.clear();
    challenges.clear();
    jest.clearAllMocks();
    fake.status.mockResolvedValue({
      state: 'unlinked',
      linked: false,
      available: false,
      link: null,
      credentials: 'hidden',
    });
    await db.query('TRUNCATE owner_account CASCADE');
    await manageOwner(db, 'init', 'whatsapp-owner@example.test', 'Fictitious-whatsapp-owner-password');
    token = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'whatsapp-owner@example.test', password: 'Fictitious-whatsapp-owner-password' })
        .expect(200)
    ).body.credential.access_token;
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.query('TRUNCATE owner_account CASCADE');
    if (app) await app.close();
  });
  it('requires owner authentication, correct Origin, idempotency and validated inputs', async () => {
    for (const path of ['', `/links/${randomUUID()}`])
      await request(app.getHttpServer()).get(`/api/v1/integrations/whatsapp${path}`).expect(401);
    for (const path of ['/links', '/disconnect', '/reconnect'])
      await request(app.getHttpServer()).post(`/api/v1/integrations/whatsapp${path}`).send({}).expect(401);
    await req('post', '/links').set('Origin', 'http://untrusted.example.test').send({ mode: 'qr' }).expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/integrations/whatsapp/links')
      .set('Cookie', `${authConfig().cookieName}=${token}`)
      .send({ mode: 'qr' })
      .expect(403);
    await req('post', '/links').unset('Idempotency-Key').send({ mode: 'qr' }).expect(400);
    for (const body of [
      { mode: 'unknown' },
      { mode: 'code' },
      { mode: 'code', phoneE164: 'local' },
      { mode: 'qr', phoneE164: '+5491100000000' },
      { mode: 'qr', extra: true },
    ])
      await req('post', '/links').send(body).expect(400);
    await req('post', '/disconnect').send({ extra: true }).expect(400);
    await req('get', '/links/invalid').expect(400);
    expect(fake.command).not.toHaveBeenCalled();
  });
  it('returns ephemeral code with no caching and persists only safe idempotency/audit metadata', async () => {
    const key = randomUUID(),
      body = { mode: 'code', phoneE164: '+5491100000000' };
    const first = await req('post', '/links', key).send(body).expect(201);
    expect(first.body.state).toBe('completed');
    expect(first.body.code).toBeUndefined();
    expect((await req('post', '/links', key).send(body).expect(201)).body).toEqual(first.body);
    expect(fake.command).toHaveBeenCalledTimes(1);
    await req('post', '/links', key)
      .send({ ...body, phoneE164: '+5491100000001' })
      .expect(409);
    const challenge = await req('get', `/links/${first.body.linkId}`).expect(200);
    expect(challenge.body.code).toBe('1234-5678');
    expect(challenge.headers['cache-control']).toBe('no-store');
    expect(challenge.headers['referrer-policy']).toBe('no-referrer');
    expect(challenge.body.phoneE164).toBeUndefined();
    expect(challenge.body.credentials).toBeUndefined();
    const persisted = JSON.stringify([
      await db.query('SELECT response FROM idempotency_record'),
      await db.query('SELECT "before","after" FROM audit_event WHERE "entityType"=\'whatsapp\''),
    ]);
    for (const sensitive of [body.phoneE164, '1234-5678', 'private-fictitious-secret', 'qrDataUrl'])
      expect(persisted).not.toContain(sensitive);
    expect((await req('get', '').expect(200)).body).toEqual({
      state: 'unlinked',
      linked: false,
      available: false,
      link: null,
    });
  });
  it('returns QR only while ready and valid, and removes pairing material after expiration or connection', async () => {
    const linked = (await req('post', '/links').send({ mode: 'qr' }).expect(201)).body;
    expect((await req('get', `/links/${linked.linkId}`).expect(200)).body.qrDataUrl).toBe(
      'data:image/png;base64,ZmFrZQ=='
    );
    const challenge = challenges.get(linked.linkId);
    challenge.expiresAt = new Date(Date.now() - 1).toISOString();
    expect((await req('get', `/links/${linked.linkId}`).expect(200)).body.qrDataUrl).toBeUndefined();
    challenge.state = 'connected';
    challenge.expiresAt = null;
    expect((await req('get', `/links/${linked.linkId}`).expect(200)).body.qrDataUrl).toBeUndefined();
    challenge.state = 'ready';
    challenge.expiresAt = null;
    await req('get', `/links/${linked.linkId}`).expect(503);
    await req('get', `/links/${randomUUID()}`).expect(404);
  });
  it('reconciles a lost command response through receipts without repeating a disconnect', async () => {
    const key = randomUUID();
    fake.command.mockImplementationOnce(async (body) => {
      commands.set(body.commandId, { commandId: body.commandId, state: 'completed', remoteLogout: 'requested' });
      throw new Error('private simulated lost response');
    });
    const first = (await req('post', '/disconnect', key).send({}).expect(201)).body;
    expect(first.state).toBe('uncertain');
    const second = (await req('post', '/disconnect', key).send({}).expect(201)).body;
    expect(second.state).toBe('completed');
    expect(second.commandId).toBe(first.commandId);
    expect(second.remoteLogout).toBe('requested');
    expect(fake.command).toHaveBeenCalledTimes(1);
    expect(fake.receipt).toHaveBeenCalledTimes(1);
    expect((await req('post', '/disconnect', key).send({}).expect(201)).body).toEqual(second);
    const reconnect = (await req('post', '/reconnect').send({}).expect(201)).body;
    expect(reconnect.state).toBe('completed');
    expect((await req('post', '/reconnect').expect(201)).body.state).toBe('completed');
  });
  it('serializes concurrent idempotent commands and never resubmits when no receipt exists', async () => {
    let entered: () => void, release: () => void;
    const started = new Promise<void>((r) => {
        entered = r;
      }),
      waiting = new Promise<void>((r) => {
        release = r;
      });
    fake.command.mockImplementationOnce(async (body) => {
      entered();
      await waiting;
      return { commandId: body.commandId, state: 'completed', linkId: body.commandId };
    });
    const key = randomUUID(),
      first = req('post', '/links', key)
        .send({ mode: 'qr' })
        .then((r) => r);
    await started;
    try {
      const retry = (await req('post', '/links', key).send({ mode: 'qr' }).expect(201)).body;
      expect(retry.state).toBe('uncertain');
      expect(fake.command).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
    const result = await first;
    expect(result.body.state).toBe('completed');
    expect((await req('post', '/links', key).send({ mode: 'qr' }).expect(201)).body).toEqual(result.body);
  });
});
