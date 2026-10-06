import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { updateReturning } from '../agenda/agenda-store.service';
import { googleConfig } from './google-config';
import { decrypt } from './google-crypto';
import { GoogleGateway, GoogleProviderError } from './google.gateway';
import { googleEvent, googleEventId, queueGoogleEntries } from './google-outbox';

@Injectable()
export class GoogleSyncService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(GoogleSyncService.name);
  constructor(
    private readonly db: DataSource,
    private readonly gateway: GoogleGateway
  ) {}

  onApplicationBootstrap() {
    if (!googleConfig(process.env, false).workerEnabled) return;
    const tick = () => {
      void this.runOnce().catch(() => this.logger.warn('No se pudo ejecutar la cola de Google; se reintentará'));
    };
    this.timer = setInterval(tick, 15000);
    this.timer.unref();
    tick();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(limit = 20) {
    if (this.running || !googleConfig(process.env, false).enabled) return;
    this.running = true;
    try {
      await this.provision();
      for (let i = 0; i < limit; i++) {
        const job = await this.claim();
        if (!job) break;
        await this.process(job);
      }
    } finally {
      this.running = false;
    }
  }

  private async provision() {
    const connection = await this.db.transaction(async (m) => {
      const [row] = await m.query(`SELECT c.*,s.timezone FROM google_connection c
        JOIN owner_account o ON o.id=c."ownerId" CROSS JOIN agenda_settings s
        WHERE o.active AND c."calendarEnabled" AND NOT c."needsReconnect" AND c."calendarId" IS NULL
          AND c."provisionAttempts"<12 AND (c."provisionUntil" IS NULL OR c."provisionUntil"<now())
        ORDER BY c."ownerId" LIMIT 1 FOR UPDATE OF c SKIP LOCKED`);
      if (!row) return null;
      const token = randomUUID();
      await m.query(
        `UPDATE google_connection SET "provisionToken"=$2,"provisionUntil"=now()+interval '5 minutes' WHERE "ownerId"=$1`,
        [row.ownerId, token]
      );
      return { ...row, provisionToken: token };
    });
    if (!connection) return;
    try {
      const refresh = decrypt(connection.refreshTokenEncrypted, `refresh:${connection.ownerId}:${connection.subject}`);
      const calendar = await this.gateway.createCalendar(refresh, connection.timezone);
      if (typeof calendar?.id !== 'string' || !calendar.id || calendar.id.length > 1000)
        throw new GoogleProviderError(502, 'temporary');
      await this.db.transaction(async (m) => {
        const updated = await updateReturning(
          m,
          `UPDATE google_connection SET "calendarId"=$4,"provisionToken"=NULL,"provisionUntil"=NULL,"provisionAttempts"=0,"lastError"=NULL,"updatedAt"=now()
          WHERE "ownerId"=$1 AND generation=$2 AND "provisionToken"=$3 AND "calendarEnabled" RETURNING *`,
          [connection.ownerId, connection.generation, connection.provisionToken, calendar.id]
        );
        if (updated) await queueGoogleEntries(m, connection.ownerId);
      });
    } catch (error) {
      const reason =
        error instanceof GoogleProviderError
          ? error.reason
          : error instanceof ServiceUnavailableException
            ? 'credentials_unavailable'
            : 'temporary';
      await this.db.query(
        `UPDATE google_connection SET "provisionToken"=NULL,"provisionUntil"=now()+interval '1 minute',
        "provisionAttempts"="provisionAttempts"+1,"lastError"=$4,"needsReconnect"=$5 WHERE "ownerId"=$1 AND generation=$2 AND "provisionToken"=$3`,
        [
          connection.ownerId,
          connection.generation,
          connection.provisionToken,
          reason,
          reason === 'authorization' || reason === 'credentials_unavailable',
        ]
      );
    }
  }

  private claim() {
    return this.db.transaction(async (m) => {
      const [row] = await m.query(`SELECT j.*,c.subject,c."refreshTokenEncrypted",c."calendarId",c.generation
        FROM google_sync_job j JOIN google_connection c ON c."ownerId"=j."ownerId" JOIN owner_account o ON o.id=c."ownerId"
        WHERE o.active AND c."calendarEnabled" AND NOT c."needsReconnect" AND c."calendarId" IS NOT NULL
          AND j.attempts<12 AND j."nextAttemptAt"<=now() AND (j."lockedUntil" IS NULL OR j."lockedUntil"<now())
        ORDER BY j."nextAttemptAt",j."entryId" LIMIT 1 FOR UPDATE OF j SKIP LOCKED`);
      if (!row) return null;
      const lockToken = randomUUID();
      await m.query(
        `UPDATE google_sync_job SET "lockedUntil"=now()+interval '5 minutes',"lockToken"=$2 WHERE "entryId"=$1`,
        [row.entryId, lockToken]
      );
      const [entry] = await m.query('SELECT * FROM schedule_entry WHERE id=$1', [row.entryId]);
      const [settings] = await m.query('SELECT timezone,version FROM agenda_settings WHERE id=1');
      return { ...row, lockToken, entry, settings };
    });
  }

  private async process(job: any) {
    try {
      const [current] = await this.db.query(
        `SELECT j."entryId" FROM google_sync_job j JOIN google_connection c ON c."ownerId"=j."ownerId"
        WHERE j."entryId"=$1 AND j."lockToken"=$2 AND c.generation=$3 AND c."calendarEnabled" AND NOT c."needsReconnect"`,
        [job.entryId, job.lockToken, job.generation]
      );
      if (!current) return;
      const refresh = decrypt(job.refreshTokenEncrypted, `refresh:${job.ownerId}:${job.subject}`);
      const eventId = googleEventId(job.entryId);
      await this.gateway.upsertEvent(
        refresh,
        job.calendarId,
        eventId,
        googleEvent(job.entry, job.settings.timezone, job.settings.version)
      );
      await this.db.transaction(async (m) => {
        const [currentJob] = await m.query(
          `SELECT * FROM google_sync_job WHERE "entryId"=$1 AND "lockToken"=$2 FOR UPDATE`,
          [job.entryId, job.lockToken]
        );
        if (!currentJob) return;
        const [connection] = await m.query(
          'SELECT generation,"calendarEnabled" FROM google_connection WHERE "ownerId"=$1',
          [job.ownerId]
        );
        if (connection?.generation === job.generation && connection.calendarEnabled) {
          await m.query(
            `INSERT INTO google_event_mapping ("entryId","ownerId","calendarId","eventId","entryVersion") VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT ("entryId") DO UPDATE SET "calendarId"=EXCLUDED."calendarId","eventId"=EXCLUDED."eventId",
            "entryVersion"=EXCLUDED."entryVersion","syncedAt"=now()`,
            [job.entryId, job.ownerId, job.calendarId, eventId, job.entry.version]
          );
        }
        if (currentJob.revision === job.revision) {
          await m.query('DELETE FROM google_sync_job WHERE "entryId"=$1 AND "lockToken"=$2', [
            job.entryId,
            job.lockToken,
          ]);
        } else {
          await m.query(
            `UPDATE google_sync_job SET "lockedUntil"=NULL,"lockToken"=NULL WHERE "entryId"=$1 AND "lockToken"=$2`,
            [job.entryId, job.lockToken]
          );
        }
      });
    } catch (error) {
      const reason =
        error instanceof GoogleProviderError
          ? error.reason
          : error instanceof ServiceUnavailableException
            ? 'credentials_unavailable'
            : 'temporary';
      const delay = Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8));
      await this.db.transaction(async (m) => {
        if (reason === 'authorization' || reason === 'credentials_unavailable') {
          await m.query(
            `UPDATE google_connection SET "needsReconnect"=true,"lastError"=$3 WHERE "ownerId"=$1 AND generation=$2`,
            [job.ownerId, job.generation, reason]
          );
        }
        if (reason === 'not_found') {
          await m.query(
            `UPDATE google_connection SET "calendarId"=NULL,"provisionUntil"=NULL,"provisionAttempts"=0,"lastError"=$3
            WHERE "ownerId"=$1 AND generation=$2 AND "calendarEnabled"`,
            [job.ownerId, job.generation, reason]
          );
        }
        await m.query(
          `UPDATE google_sync_job SET attempts=CASE WHEN revision=$3 THEN attempts+1 ELSE attempts END,
          "lastError"=$4,"lockedUntil"=NULL,"lockToken"=NULL,
          "nextAttemptAt"=CASE WHEN revision=$3 THEN now()+$5*interval '1 second' ELSE now() END
          WHERE "entryId"=$1 AND "lockToken"=$2`,
          [job.entryId, job.lockToken, job.revision, reason, delay]
        );
      });
    }
  }
}
