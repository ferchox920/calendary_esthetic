import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { OwnerAccount } from '../auth/entities/owner-account.entity';
import { JwtPayload } from '../auth/interface/jwt-payload.interface';
import { CALENDAR_SCOPE, googleConfig } from './google-config';
import { decrypt, encrypt, hash } from './google-crypto';
import { GoogleGateway } from './google.gateway';
import { queueGoogleEntries } from './google-outbox';

@Injectable()
export class GoogleService {
  constructor(
    private readonly db: DataSource,
    private readonly gateway: GoogleGateway,
    private readonly auth: AuthService
  ) {}

  async begin(user?: JwtPayload) {
    googleConfig();
    const state = randomBytes(32).toString('base64url'),
      nonce = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const stateHash = hash(state);
    const authorizationUrl = this.gateway.authorizationUrl(state, nonce, challenge, !!user);
    await this.db.transaction(async (m) => {
      await m.query('DELETE FROM google_oauth_state WHERE "expiresAt"<now()');
      if (user) {
        const [owner] = await m.query('SELECT * FROM owner_account WHERE id=$1 FOR UPDATE', [user.id]);
        if (!owner?.active || owner.sessionVersion !== user.sessionVersion) throw new UnauthorizedException();
      }
      await m.query(
        `INSERT INTO google_oauth_state ("stateHash",purpose,"ownerId","sessionVersion","nonceHash","verifierEncrypted","expiresAt")
        VALUES ($1,$2,$3,$4,$5,$6,now()+interval '10 minutes')`,
        [
          stateHash,
          user ? 'connect' : 'login',
          user?.id || null,
          user?.sessionVersion || null,
          hash(nonce),
          encrypt(verifier, `oauth:${stateHash}`),
        ]
      );
    });
    return { state, authorizationUrl };
  }

  async callback(state: unknown, cookie: unknown, code: unknown, error: unknown) {
    googleConfig();
    if (
      typeof state !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      typeof cookie !== 'string' ||
      !timingSafeEqual(Buffer.from(hash(state)), Buffer.from(hash(cookie)))
    )
      throw new BadRequestException('Estado de autorización inválido');
    // DELETE is atomic: only one callback can use a state, even across processes.
    const [pending] = await this.db.query(
      `DELETE FROM google_oauth_state WHERE "stateHash"=$1 AND "expiresAt">now() RETURNING *`,
      [hash(state)]
    );
    // PostgreSQL DELETE raw results use [rows, affectedCount].
    const attempt = pending?.[0];
    if (!attempt) throw new BadRequestException('La autorización venció o ya fue utilizada');
    if (error !== undefined) throw new BadRequestException('No se concedió la autorización de Google');
    if (typeof code !== 'string' || code.length < 1 || code.length > 4096)
      throw new BadRequestException('Código de autorización inválido');
    const identity = await this.gateway.exchange(
      code,
      decrypt(attempt.verifierEncrypted, `oauth:${attempt.stateHash}`)
    );
    if (
      typeof identity.subject !== 'string' ||
      identity.subject.length > 255 ||
      !identity.subject ||
      typeof identity.email !== 'string' ||
      identity.email.length > 254 ||
      !identity.email ||
      typeof identity.nonce !== 'string' ||
      hash(identity.nonce) !== attempt.nonceHash
    ) {
      throw new UnauthorizedException('Identidad de Google inválida');
    }
    if (attempt.purpose === 'login') {
      return this.db.transaction(async (m) => {
        const [owner] = await m.query(
          `SELECT o.* FROM owner_account o JOIN google_connection g ON g."ownerId"=o.id
          WHERE g.subject=$1 AND g."loginEnabled" AND o.active FOR UPDATE OF o,g`,
          [identity.subject]
        );
        if (!owner) throw new UnauthorizedException('Esta cuenta de Google no está vinculada a Gabriela');
        return { mode: 'login', session: this.auth.issueSession(owner as OwnerAccount) };
      });
    }
    if (!identity.scopes.includes(CALENDAR_SCOPE))
      throw new BadRequestException('Falta el permiso del calendario de la aplicación');
    return this.db.transaction(async (m) => {
      const [owner] = await m.query('SELECT * FROM owner_account WHERE id=$1 FOR UPDATE', [attempt.ownerId]);
      if (!owner?.active || owner.sessionVersion !== attempt.sessionVersion)
        throw new UnauthorizedException('La sesión cambió; ingresa otra vez');
      const [before] = await m.query('SELECT * FROM google_connection WHERE "ownerId"=$1 FOR UPDATE', [owner.id]);
      if (before && before.subject !== identity.subject && (before.loginEnabled || before.calendarEnabled)) {
        throw new ConflictException('Desvincula la cuenta anterior antes de conectar otra');
      }
      const sameIdentity = before?.subject === identity.subject;
      const refreshTokenEncrypted = identity.refreshToken
        ? encrypt(identity.refreshToken, `refresh:${owner.id}:${identity.subject}`)
        : sameIdentity
          ? before.refreshTokenEncrypted
          : null;
      if (!refreshTokenEncrypted)
        throw new BadRequestException('Google no entregó acceso sin conexión; vuelve a conceder los permisos');
      if (!sameIdentity) await m.query('DELETE FROM google_event_mapping WHERE "ownerId"=$1', [owner.id]);
      const [after] = await m.query(
        `INSERT INTO google_connection
        ("ownerId",subject,email,"refreshTokenEncrypted","calendarId","loginEnabled","calendarEnabled",generation)
        VALUES ($1,$2,$3,$4,$5,true,true,$6) ON CONFLICT ("ownerId") DO UPDATE SET subject=EXCLUDED.subject,email=EXCLUDED.email,
        "refreshTokenEncrypted"=EXCLUDED."refreshTokenEncrypted","calendarId"=EXCLUDED."calendarId","loginEnabled"=true,"calendarEnabled"=true,
        "needsReconnect"=false,generation=EXCLUDED.generation,"provisionToken"=NULL,"provisionUntil"=NULL,"provisionAttempts"=0,"lastError"=NULL,"updatedAt"=now() RETURNING *`,
        [
          owner.id,
          identity.subject,
          identity.email,
          refreshTokenEncrypted,
          sameIdentity ? before.calendarId : null,
          randomUUID(),
        ]
      );
      await queueGoogleEntries(m, owner.id);
      await this.audit(m, owner.id, 'connect', before, after);
      return { mode: 'connect', googleEmail: identity.email, calendarQueued: true };
    });
  }

  private safe(row: any) {
    return row
      ? { googleEmail: row.email, loginEnabled: row.loginEnabled, calendarEnabled: row.calendarEnabled }
      : null;
  }
  private audit(m: EntityManager, actor: string, action: string, before: any, after: any) {
    return m.query(
      `INSERT INTO audit_event ("actorId","entityType","entityId",action,"before","after","requestId") VALUES ($1,'google',$2,$3,$4,$5,$6)`,
      [actor, actor, action, JSON.stringify(this.safe(before)), JSON.stringify(this.safe(after)), randomUUID()]
    );
  }

  async status(ownerId: string) {
    const config = googleConfig(process.env, false);
    const [row] = await this.db.query(
      `SELECT email,"loginEnabled","calendarEnabled","calendarId","needsReconnect","lastError" FROM google_connection WHERE "ownerId"=$1`,
      [ownerId]
    );
    const [jobs] = await this.db.query(
      `SELECT count(*)::int AS pending,count(*) FILTER (WHERE attempts>=12)::int AS failed FROM google_sync_job WHERE "ownerId"=$1`,
      [ownerId]
    );
    const [synced] = await this.db.query(
      `SELECT max("syncedAt") AS "lastSyncedAt" FROM google_event_mapping WHERE "ownerId"=$1`,
      [ownerId]
    );
    return {
      configured: config.enabled,
      googleEmail: row?.email || null,
      loginConnected: !!row?.loginEnabled,
      calendarConnected: !!row?.calendarEnabled,
      calendarReady: !!row?.calendarId,
      needsReconnect: !!row?.needsReconnect,
      pendingJobs: jobs.pending,
      failedJobs: jobs.failed,
      lastSyncedAt: synced.lastSyncedAt,
      errorCode: row?.lastError || null,
    };
  }

  async resync(user: JwtPayload) {
    googleConfig();
    await this.db.transaction(async (m) => {
      await m.query('SELECT id FROM agenda_settings WHERE id=1 FOR UPDATE');
      const [connection] = await m.query('SELECT * FROM google_connection WHERE "ownerId"=$1 FOR UPDATE', [user.id]);
      if (!connection?.calendarEnabled || connection.needsReconnect)
        throw new ConflictException('Vuelve a conectar Google Calendar');
      await m.query(
        `UPDATE google_connection SET "provisionAttempts"=0,"provisionUntil"=NULL,"provisionToken"=NULL,"lastError"=NULL
        WHERE "ownerId"=$1 AND "calendarId" IS NULL AND ("provisionToken" IS NULL OR "provisionUntil"<now())`,
        [user.id]
      );
      await queueGoogleEntries(m, user.id);
    });
    return { queued: true };
  }

  async disconnect(user: JwtPayload) {
    let refresh: string | undefined;
    await this.db.transaction(async (m) => {
      const [owner] = await m.query('SELECT * FROM owner_account WHERE id=$1 FOR UPDATE', [user.id]);
      if (!owner?.active || owner.sessionVersion !== user.sessionVersion) throw new UnauthorizedException();
      const [before] = await m.query('SELECT * FROM google_connection WHERE "ownerId"=$1 FOR UPDATE', [user.id]);
      await m.query('UPDATE owner_account SET "sessionVersion"="sessionVersion"+1 WHERE id=$1', [user.id]);
      if (!before) return;
      if (before.refreshTokenEncrypted && googleConfig(process.env, false).enabled) {
        try {
          refresh = decrypt(before.refreshTokenEncrypted, `refresh:${user.id}:${before.subject}`);
        } catch {
          /* Unlinking must work even after losing the encryption key. */
        }
      }
      await m.query(
        `UPDATE google_connection SET "loginEnabled"=false,"calendarEnabled"=false,"refreshTokenEncrypted"=NULL,
        "needsReconnect"=false,generation=$2,"provisionToken"=NULL,"provisionUntil"=NULL,"updatedAt"=now() WHERE "ownerId"=$1`,
        [user.id, randomUUID()]
      );
      await m.query('DELETE FROM google_sync_job WHERE "ownerId"=$1', [user.id]);
      await m.query('DELETE FROM google_oauth_state WHERE "ownerId"=$1', [user.id]);
      await this.audit(m, user.id, 'disconnect', before, { ...before, loginEnabled: false, calendarEnabled: false });
    });
    let permissionRevoked = false;
    if (refresh) {
      try {
        await this.gateway.revoke(refresh);
        permissionRevoked = true;
      } catch {
        /* Local disconnect remains effective. */
      }
    }
    return { disconnected: true, googlePermissionRevoked: permissionRevoked };
  }
}
