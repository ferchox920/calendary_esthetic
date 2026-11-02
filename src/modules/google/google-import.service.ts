import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Temporal } from '@js-temporal/polyfill';
import { DataSource } from 'typeorm';
import { AgendaStore, updateReturning } from '../agenda/agenda-store.service';
import { JwtPayload } from '../auth/interface/jwt-payload.interface';
import { decrypt } from './google-crypto';
import { googleConfig } from './google-config';
import { GoogleGateway, GoogleProviderError } from './google.gateway';
import { LinkGoogleEventDto, SelectGoogleCalendarDto } from './google-import.dto';
import { normalizeGoogleEvent } from './google-import-event';

@Injectable()
export class GoogleImportService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(GoogleImportService.name);
  constructor(
    private readonly db: DataSource,
    private readonly gateway: GoogleGateway,
    private readonly store: AgendaStore
  ) {}

  onApplicationBootstrap() {
    if (!googleConfig(process.env, false).workerEnabled) return;
    const tick = () =>
      void this.runOnce().catch(() => this.logger.warn('No se pudo leer Google Calendar; se reintentará'));
    this.timer = setInterval(tick, 15000);
    this.timer.unref();
    tick();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async connection(ownerId: string) {
    googleConfig();
    const [c] = await this.db.query('SELECT * FROM google_connection WHERE "ownerId"=$1', [ownerId]);
    if (!c?.sourceReadEnabled || c.needsReconnect || !c.refreshTokenEncrypted)
      throw new ConflictException('Conectá Google y concedé el permiso para leer tu calendario');
    return { ...c, refresh: decrypt(c.refreshTokenEncrypted, `refresh:${ownerId}:${c.subject}`) };
  }

  async calendars(ownerId: string) {
    const c = await this.connection(ownerId);
    return (await this.gateway.listCalendars(c.refresh))
      .filter((item) => item.id !== c.calendarId)
      .map((item) => ({
        id: item.id,
        name: item.summaryOverride || item.summary || item.id,
        timezone: item.timeZone || 'UTC',
        primary: !!item.primary,
      }));
  }

  async select(user: JwtPayload, key: string, dto: SelectGoogleCalendarDto) {
    const c = await this.connection(user.id);
    const calendar = (await this.gateway.listCalendars(c.refresh)).find(
      (item) => item.id === dto.calendarId && item.id !== c.calendarId
    );
    if (!calendar) throw new BadRequestException('Elegí uno de tus calendarios disponibles');
    const zone = calendar.timeZone || 'UTC';
    const now = Temporal.Now.zonedDateTimeISO(zone);
    return this.store.write(user.id, 'google.source.select', key, dto, async (m, _, requestId) => {
      const [current] = await m.query('SELECT * FROM google_connection WHERE "ownerId"=$1 FOR UPDATE', [user.id]);
      if (!current?.sourceReadEnabled || current.needsReconnect || current.generation !== c.generation)
        throw new ConflictException('La conexión cambió; volvé a conectar Google');
      const [before] = await m.query('SELECT * FROM google_calendar_source WHERE "ownerId"=$1 FOR UPDATE', [user.id]);
      // Re-selecting the same calendar preserves progress, cursor and manual links.
      if (before?.calendarId === dto.calendarId && before.enabled) return { queued: true, calendarName: before.name };
      await m.query(
        `INSERT INTO google_calendar_source ("ownerId","calendarId",name,timezone,"rangeFrom","rangeTo")
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("ownerId") DO UPDATE SET "calendarId"=EXCLUDED."calendarId",name=EXCLUDED.name,
        timezone=EXCLUDED.timezone,enabled=true,generation=uuid_generate_v4(),"syncToken"=NULL,"pageToken"=NULL,
        "snapshotId"=uuid_generate_v4(),"fullSync"=true,"rangeFrom"=EXCLUDED."rangeFrom","rangeTo"=EXCLUDED."rangeTo",
        "lastSyncedAt"=NULL,"lastError"=NULL,attempts=0,"nextAttemptAt"=now(),"lockToken"=NULL,"lockedUntil"=NULL`,
        [
          user.id,
          dto.calendarId,
          calendar.summaryOverride || calendar.summary || dto.calendarId,
          zone,
          now.subtract({ years: 5 }).toInstant().toString(),
          now.add({ years: 2 }).toInstant().toString(),
        ]
      );
      await this.store.audit(
        m,
        user.id,
        'google',
        user.id,
        'select-source',
        before ? { calendarId: before.calendarId } : null,
        { calendarId: dto.calendarId },
        requestId
      );
      return { queued: true, calendarName: calendar.summary || dto.calendarId };
    });
  }

  async sync(user: JwtPayload, key: string) {
    await this.connection(user.id);
    return this.store.write(user.id, 'google.source.sync', key, {}, async (m) => {
      const row = await updateReturning(
        m,
        `UPDATE google_calendar_source SET enabled=true,attempts=0,"nextAttemptAt"=now(),"lastError"=NULL
        WHERE "ownerId"=$1 RETURNING "ownerId"`,
        [user.id]
      );
      if (!row) throw new ConflictException('Elegí el calendario que querés importar');
      return { queued: true };
    });
  }

  async event(ownerId: string, id: string) {
    const [row] = await this.db.query(
      `SELECT v.* FROM google_agenda_entry v JOIN google_import_event e ON e.id=v.id WHERE e."ownerId"=$1 AND e.id=$2`,
      [ownerId, id]
    );
    if (!row) throw new NotFoundException('Evento de Google inexistente');
    return row;
  }

  link(user: JwtPayload, key: string, id: string, dto: LinkGoogleEventDto) {
    return this.store.write(user.id, `google.event.link:${id}`, key, dto, async (m, _, requestId) => {
      const [before] = await m.query('SELECT * FROM google_import_event WHERE "ownerId"=$1 AND id=$2 FOR UPDATE', [
        user.id,
        id,
      ]);
      this.store.checkVersion(before, dto.version);
      if (dto.projectId) {
        const [project] = await m.query(
          `SELECT p.id FROM tattoo_project p JOIN client c ON c.id=p."clientId"
          WHERE p.id=$1 AND p."archivedAt" IS NULL AND c."archivedAt" IS NULL FOR UPDATE OF p,c`,
          [dto.projectId]
        );
        if (!project) throw new BadRequestException('Elegí un tratamiento y cliente activos');
      }
      const after = await updateReturning(
        m,
        `UPDATE google_import_event SET "projectId"=$3,version=version+1,"updatedAt"=now()
        WHERE "ownerId"=$1 AND id=$2 RETURNING *`,
        [user.id, id, dto.projectId || null]
      );
      await this.store.audit(
        m,
        user.id,
        'google',
        id,
        'link-event',
        { projectId: before.projectId },
        { projectId: after.projectId },
        requestId
      );
      return { id, projectId: after.projectId, version: after.version };
    });
  }

  async runOnce(limit = 20) {
    if (this.running || !googleConfig(process.env, false).enabled) return;
    this.running = true;
    try {
      for (let i = 0; i < limit; i++) {
        const job = await this.db.transaction(async (m) => {
          const [source] =
            await m.query(`SELECT s.*,c.subject,c.generation AS "connectionGeneration",c."refreshTokenEncrypted"
            FROM google_calendar_source s JOIN google_connection c ON c."ownerId"=s."ownerId" JOIN owner_account o ON o.id=c."ownerId"
            WHERE s.enabled AND c."sourceReadEnabled" AND NOT c."needsReconnect" AND o.active
              AND s."nextAttemptAt"<=now() AND (s."lockedUntil" IS NULL OR s."lockedUntil"<now())
            ORDER BY s."nextAttemptAt" LIMIT 1 FOR UPDATE OF s SKIP LOCKED`);
          if (!source) return null;
          if (new Date(source.rangeTo).getTime() < Date.now() + 180 * 86400000 && !source.pageToken) {
            source.rangeTo = Temporal.Now.zonedDateTimeISO(source.timezone).add({ years: 2 }).toInstant().toString();
            source.syncToken = null;
            source.fullSync = true;
            source.snapshotId = randomUUID();
            await m.query(
              `UPDATE google_calendar_source SET "rangeTo"=$2,"syncToken"=NULL,"fullSync"=true,"snapshotId"=$3 WHERE "ownerId"=$1`,
              [source.ownerId, source.rangeTo, source.snapshotId]
            );
          }
          source.lockToken = randomUUID();
          await m.query(
            `UPDATE google_calendar_source SET "lockToken"=$2,"lockedUntil"=now()+interval '5 minutes' WHERE "ownerId"=$1`,
            [source.ownerId, source.lockToken]
          );
          return source;
        });
        if (!job) break;
        await this.process(job);
      }
    } finally {
      this.running = false;
    }
  }

  private async process(job: any) {
    try {
      const refresh = decrypt(job.refreshTokenEncrypted, `refresh:${job.ownerId}:${job.subject}`);
      const page = await this.gateway.listEvents(refresh, job.calendarId, job);
      if (
        !Array.isArray(page.items) ||
        (page.nextPageToken
          ? typeof page.nextPageToken !== 'string'
          : typeof page.nextSyncToken !== 'string' || !page.nextSyncToken)
      )
        throw new GoogleProviderError(502, 'temporary');
      const normalized = page.items.map((event: any) => normalizeGoogleEvent(event, page.timeZone || job.timezone));
      await this.db.transaction(async (m) => {
        // Serialize imports with local booking/linking, and discard stale network results after reconnect/switch.
        await m.query('SELECT id FROM agenda_settings WHERE id=1 FOR UPDATE');
        const [source] = await m.query(
          `SELECT s.* FROM google_calendar_source s JOIN google_connection c ON c."ownerId"=s."ownerId"
          WHERE s."ownerId"=$1 AND s.generation=$2 AND s."lockToken"=$3 AND c.generation=$4 AND s.enabled AND c."sourceReadEnabled" AND NOT c."needsReconnect"
          FOR UPDATE OF s`,
          [job.ownerId, job.generation, job.lockToken, job.connectionGeneration]
        );
        if (!source) return;
        for (const e of normalized) {
          if (e.status === 'cancelled') {
            await m.query(
              `UPDATE google_import_event SET status='cancelled',version=version+CASE WHEN status='cancelled' THEN 0 ELSE 1 END,
              "snapshotId"=$4,"updatedAt"=now() WHERE "ownerId"=$1 AND "calendarId"=$2 AND ("eventId"=$3 OR "recurringEventId"=$3)`,
              [job.ownerId, job.calendarId, e.eventId, job.snapshotId]
            );
          } else {
            await m.query(
              `INSERT INTO google_import_event ("ownerId","calendarId","eventId",title,description,location,"startAt","endAt","allDay",status,busy,etag,"recurringEventId","snapshotId")
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
              ON CONFLICT ("ownerId","calendarId","eventId") DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,
                location=EXCLUDED.location,"startAt"=EXCLUDED."startAt","endAt"=EXCLUDED."endAt","allDay"=EXCLUDED."allDay",
                status=EXCLUDED.status,busy=EXCLUDED.busy,etag=EXCLUDED.etag,"recurringEventId"=EXCLUDED."recurringEventId","snapshotId"=EXCLUDED."snapshotId",
                version=google_import_event.version+CASE WHEN ROW(google_import_event.title,google_import_event.description,google_import_event.location,
                  google_import_event."startAt",google_import_event."endAt",google_import_event.status,google_import_event.busy,google_import_event."allDay")
                  IS DISTINCT FROM ROW(EXCLUDED.title,EXCLUDED.description,EXCLUDED.location,EXCLUDED."startAt",EXCLUDED."endAt",EXCLUDED.status,EXCLUDED.busy,EXCLUDED."allDay") THEN 1 ELSE 0 END,
                "updatedAt"=now()`,
              [
                job.ownerId,
                job.calendarId,
                e.eventId,
                e.title,
                e.description,
                e.location,
                e.startAt,
                e.endAt,
                e.allDay,
                e.status,
                e.busy,
                e.etag,
                e.recurringEventId,
                job.snapshotId,
              ]
            );
          }
        }
        if (!page.nextPageToken && job.fullSync) {
          // Only a complete snapshot may cancel unseen events; retained historical links are never deleted.
          await m.query(
            `UPDATE google_import_event SET status='cancelled',version=version+1,"updatedAt"=now()
            WHERE "ownerId"=$1 AND "calendarId"=$2 AND "snapshotId"<>$3 AND status<>'cancelled'
              AND "startAt"<$5 AND $4<"endAt"`,
            [job.ownerId, job.calendarId, job.snapshotId, job.rangeFrom, job.rangeTo]
          );
        }
        await m.query(
          `UPDATE google_calendar_source SET "pageToken"=$2,"syncToken"=CASE WHEN $2::text IS NULL THEN $3 ELSE "syncToken" END,
          "fullSync"=CASE WHEN $2::text IS NULL THEN false ELSE "fullSync" END,
          "lastSyncedAt"=CASE WHEN $2::text IS NULL THEN now() ELSE "lastSyncedAt" END,
          timezone=$4,attempts=0,"lastError"=NULL,"nextAttemptAt"=CASE WHEN $2::text IS NULL THEN now()+interval '1 minute' ELSE now() END,
          "lockToken"=NULL,"lockedUntil"=NULL WHERE "ownerId"=$1`,
          [job.ownerId, page.nextPageToken || null, page.nextSyncToken || null, page.timeZone || job.timezone]
        );
      });
    } catch (error) {
      const reason =
        error instanceof GoogleProviderError
          ? error.reason
          : error instanceof ServiceUnavailableException
            ? 'credentials_unavailable'
            : 'invalid_event';
      if (error instanceof GoogleProviderError && (error.status === 410 || (error.status === 400 && job.pageToken))) {
        await this.db.query(
          `UPDATE google_calendar_source SET "syncToken"=CASE WHEN $4 THEN NULL ELSE "syncToken" END,"pageToken"=NULL,
          "fullSync"=CASE WHEN $4 THEN true ELSE "fullSync" END,"snapshotId"=CASE WHEN $4 OR "fullSync" THEN uuid_generate_v4() ELSE "snapshotId" END,
          "lockToken"=NULL,"lockedUntil"=NULL,"nextAttemptAt"=now(),"lastError"=NULL WHERE "ownerId"=$1 AND generation=$2 AND "lockToken"=$3`,
          [job.ownerId, job.generation, job.lockToken, error.status === 410]
        );
        return;
      }
      await this.db.transaction(async (m) => {
        if (reason === 'authorization' || reason === 'credentials_unavailable') {
          await m.query(
            `UPDATE google_connection SET "needsReconnect"=true,"lastError"=$3 WHERE "ownerId"=$1 AND generation=$2`,
            [job.ownerId, job.connectionGeneration, reason]
          );
        }
        await m.query(
          `UPDATE google_calendar_source SET attempts=attempts+1,"lastError"=$4,"lockToken"=NULL,"lockedUntil"=NULL,
          "nextAttemptAt"=now()+$5*interval '1 second' WHERE "ownerId"=$1 AND generation=$2 AND "lockToken"=$3`,
          [job.ownerId, job.generation, job.lockToken, reason, Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8))]
        );
      });
    }
  }
}
