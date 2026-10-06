import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { OwnerAccount } from '../src/modules/auth/entities/owner-account.entity';
import { manageOwner } from '../src/modules/auth/owner-management';
import { Roles } from '../src/utility/common/roles-enum';
import { TokenTypes } from '../src/utility/common/token-types.enum';

describe('Private owner access (real PostgreSQL)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let jwt: JwtService;
  let owner: OwnerAccount;
  const email = 'gabriela-demo@example.test';
  const password = 'Fictitious-password-for-e2e-only';
  const origin = 'http://127.0.0.1:3000';
  const login = () => request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    setupApp(app);
    await app.init();
    db = app.get(DataSource);
    expect(db.options.database).toBe('calendary_esthetic_test');
    expect(db.options.type).toBe('postgres');
    await db.runMigrations();
    await db.query('TRUNCATE public.owner_account, public.users, public.admin, public.professional CASCADE');
    await manageOwner(db, 'init', email, password);
    owner = await db.getRepository(OwnerAccount).findOneByOrFail({ email });
    jwt = app.get(JwtService);
    await db.query('INSERT INTO users (email, password, otp, "otpExpiryTime") VALUES ($1, $2, $3, CURRENT_DATE)', [
      'client-demo@example.test',
      'fake-hash-for-sanitization',
      'fake-otp',
    ]);
    await db.query('INSERT INTO admin (name, email, password) VALUES ($1, $2, $3)', [
      'Demo',
      'admin-demo@example.test',
      'fake-hash-for-sanitization',
    ]);
    await db.query('INSERT INTO professional (name, "lastName", email, password) VALUES ($1, $2, $3, $4)', [
      'Demo',
      'Test',
      'professional-demo@example.test',
      'fake-hash-for-sanitization',
    ]);
  });

  afterAll(async () => {
    if (db?.isInitialized && db.options.database === 'calendary_esthetic_test') {
      await db.query('TRUNCATE public.owner_account, public.users, public.admin, public.professional CASCADE');
    }
    if (app) await app.close();
  });

  it('protects every registered private route, including legacy CRUD', async () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    let checked = 0;
    for (const [path, methods] of Object.entries(document.paths)) {
      if (path === '/api/v1/auth/login') continue;
      const concretePath = path.replace(/\{[^}]+\}/g, owner.id);
      for (const method of Object.keys(methods)) {
        if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) continue;
        await request(app.getHttpServer())[method](concretePath).expect(401);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('rejects malformed/incorrect credentials and the former role selector', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'wrong' }).expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@example.test', password: 'wrong' })
      .expect(401);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password, type: 'admin' }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: {} }).expect(400);
  });

  it('returns a safe profile, exact JWT expiration and a protected cookie', async () => {
    const result = await login().expect(200);
    const token = result.body.credential.access_token;
    const payload = jwt.decode(token) as { exp: number; iat: number };
    expect(payload.exp - payload.iat).toBe(3600);
    expect(result.body.credential.expirationTime).toBe(new Date(payload.exp * 1000).toISOString());
    expect(result.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(result.headers['set-cookie'][0]).toContain('SameSite=Strict');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.profile).toEqual({ id: owner.id, name: 'Gabriela', email });
    await request(app.getHttpServer()).get('/api/v1/auth/profile').set('Authorization', `Bearer ${token}`).expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/profile')
      .set('Cookie', result.headers['set-cookie'])
      .expect(200);
  });

  it('never returns hashes or OTPs in legacy read responses', async () => {
    const result = await login().expect(200);
    for (const path of ['/users/all', '/admin', '/professional']) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .set('Authorization', `Bearer ${result.body.credential.access_token}`)
        .expect(200);
      expect(response.body.length).toBe(1);
      expect(JSON.stringify(response.body)).not.toMatch(/password|otp|fake-hash|fake-otp/i);
    }
  });

  it('rejects refresh, wrong signature, expired and malformed-subject tokens', async () => {
    const claims = {
      sub: owner.id,
      scope: 'owner',
      type: TokenTypes.ACCESS,
      roles: Roles.ADMIN,
      sessionVersion: owner.sessionVersion,
    };
    const tokens = [
      jwt.sign({ ...claims, type: TokenTypes.REFRESH }),
      jwt.sign(claims, { secret: 'different-fictitious-secret-for-wrong-signature' }),
      jwt.sign(claims, { expiresIn: -1 }),
      jwt.sign({ ...claims, sub: 'invalid-id' }),
      new JwtService({ secret: process.env.JWT_SECRET }).sign(claims, {
        issuer: 'calendary-esthetic',
        audience: 'gabriela-agenda',
      }),
      'broken.jwt',
    ];
    for (const token of tokens) {
      await request(app.getHttpServer())
        .get('/api/v1/consultation')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    }
    const foreignIdentity = jwt.sign({ ...claims, scope: 'client', roles: Roles.USER });
    await request(app.getHttpServer())
      .get('/api/v1/consultation')
      .set('Authorization', `Bearer ${foreignIdentity}`)
      .expect(403);
  });

  it('rejects cookie writes without valid Origin and clears/revokes all sessions on logout', async () => {
    const first = await login().expect(200);
    const second = await login().expect(200);
    const cookie = first.headers['set-cookie'];
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', cookie).expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'https://foreign.example.test')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Authorization', 'garbage')
      .expect(401);
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .expect(204);
    expect(result.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
    for (const token of [first.body.credential.access_token, second.body.credential.access_token]) {
      await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    }
  });

  it('closes registration/OTP endpoints even for the owner', async () => {
    const result = await login().expect(200);
    for (const [method, path] of [
      ['post', '/users/register'],
      ['get', '/users/generate-otp/demo@example.test'],
      ['get', '/users/validate-otp/demo@example.test/1234'],
      ['get', '/auth/refreshToken'],
    ]) {
      await request(app.getHttpServer())
        [method](`/api/v1${path}`)
        .set('Authorization', `Bearer ${result.body.credential.access_token}`)
        .expect(404);
    }
  });

  it('rejects deactivated owners and invalidates old passwords/tokens on assisted recovery', async () => {
    const previous = await login().expect(200);
    await db.getRepository(OwnerAccount).update(owner.id, { active: false });
    await login().expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${previous.body.credential.access_token}`)
      .expect(401);
    const recoveredPassword = 'Recovered-fictitious-password-for-e2e';
    await manageOwner(db, 'reset', email, recoveredPassword);
    await login().expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: recoveredPassword })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${previous.body.credential.access_token}`)
      .expect(401);
  });

  it('prevents a second owner in both provisioning and direct database writes', async () => {
    await expect(manageOwner(db, 'init', 'another-demo@example.test', password)).rejects.toThrow(
      'Owner already exists'
    );
    await expect(
      db.getRepository(OwnerAccount).insert({ email: 'another-demo@example.test', passwordHash: 'fake' })
    ).rejects.toMatchObject({ code: '23505' });
    expect(await db.getRepository(OwnerAccount).count()).toBe(1);
  });
});
