import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AgendaStore, requiredText, updateReturning } from './agenda-store.service';
import {
  ChangeBlockDto,
  CorrectStatusDto,
  CreateBlockDto,
  CreateSessionDto,
  RescheduleDto,
  ReasonDto,
  SettingsDto,
  VersionDto,
  WindowsDto,
} from './agenda.dto';
import {
  dayRange,
  interval,
  localDate,
  readRange,
  timezone,
  validateWindows,
  withinWindow,
  zoned,
} from './agenda-time';

const activePredicate = `((kind='session' AND "sessionStatus" <> 'canceled') OR (kind='block' AND "blockActive"))`;

@Injectable()
export class SchedulingService {
  constructor(private readonly store: AgendaStore) {}

  private windows(m: EntityManager) {
    return m.query(`SELECT id,weekday,to_char("localStart",'HH24:MI') AS "localStart",to_char("localEnd",'HH24:MI') AS "localEnd","validFrom"::text,"validTo"::text
      FROM working_window WHERE "agendaId"=1 ORDER BY weekday,"validFrom","localStart"`);
  }

  settings() {
    return this.store.db.transaction('REPEATABLE READ', async (m) => {
      const [settings] = await m.query('SELECT * FROM agenda_settings WHERE id=1');
      return { ...settings, windows: await this.windows(m) };
    });
  }

  private async incompatible(m: EntityManager, settings: any, windows: any[]) {
    const sessions = await m.query(
      `SELECT * FROM schedule_entry WHERE kind='session' AND "sessionStatus" <> 'canceled' AND "endAt">now()`
    );
    return sessions
      .filter((s) => !withinWindow(s, settings, windows))
      .map((s) => ({ id: s.id, startAt: s.startAt, endAt: s.endAt }));
  }

  updateSettings(actor: string, key: string, dto: SettingsDto) {
    return this.store.write(actor, 'agenda.settings', key, dto, async (m, before, requestId) => {
      this.store.checkVersion(before, dto.version);
      const zone = dto.timezone === undefined ? before.timezone : timezone(dto.timezone);
      if (zone !== before.timezone) {
        const conflicts = await this.incompatible(m, { ...before, timezone: zone }, await this.windows(m));
        if (conflicts.length)
          throw new ConflictException({ message: 'La zona deja sesiones fuera de jornada', conflicts });
      }
      const after = await updateReturning(
        m,
        `UPDATE agenda_settings SET timezone=$1,"defaultPrepMinutes"=$2,"defaultCleanupMinutes"=$3,version=version+1 WHERE id=1 RETURNING *`,
        [
          zone,
          dto.defaultPrepMinutes ?? before.defaultPrepMinutes,
          dto.defaultCleanupMinutes ?? before.defaultCleanupMinutes,
        ]
      );
      await this.store.audit(m, actor, 'agenda', '1', 'settings', before, after, requestId);
      return after;
    });
  }

  replaceWindows(actor: string, key: string, dto: WindowsDto) {
    return this.store.write(actor, 'agenda.windows', key, dto, async (m, settings, requestId) => {
      this.store.checkVersion(settings, dto.version);
      validateWindows(dto.windows);
      const before = await this.windows(m);
      const today = zoned(new Date(), settings.timezone).toPlainDate().toString();
      // Past windows are retained. Replacements take effect today or later.
      if (dto.windows.some((w) => w.validFrom < today))
        throw new BadRequestException('Las nuevas ventanas deben comenzar hoy o después');
      const yesterday = localDate(today).subtract({ days: 1 }).toString();
      const historical = before
        .filter((w) => w.validFrom < today)
        .map((w) => ({ ...w, validTo: w.validTo && w.validTo < today ? w.validTo : yesterday }));
      const conflicts = await this.incompatible(m, settings, [...historical, ...dto.windows]);
      if (conflicts.length)
        throw new ConflictException({ message: 'Los horarios dejan sesiones fuera de jornada', conflicts });
      await m.query('DELETE FROM working_window WHERE "agendaId"=1 AND "validFrom">=$1', [today]);
      await m.query(
        `UPDATE working_window SET "validTo"=$1 WHERE "agendaId"=1 AND "validFrom"<$2 AND ("validTo" IS NULL OR "validTo">=$2)`,
        [yesterday, today]
      );
      for (const w of dto.windows) {
        await m.query(
          `INSERT INTO working_window ("agendaId",weekday,"localStart","localEnd","validFrom","validTo") VALUES (1,$1,$2,$3,$4,$5)`,
          [w.weekday, w.localStart, w.localEnd, w.validFrom, w.validTo || null]
        );
      }
      const updated = await updateReturning(m, 'UPDATE agenda_settings SET version=version+1 WHERE id=1 RETURNING *');
      const after = { ...updated, windows: await this.windows(m) };
      await this.store.audit(m, actor, 'agenda', '1', 'windows', { ...settings, windows: before }, after, requestId);
      return after;
    });
  }

  private async projectAvailable(m: EntityManager, projectId: string) {
    const [project] = await m.query(
      `SELECT p.*,c."archivedAt" AS "clientArchivedAt" FROM tattoo_project p JOIN client c ON c.id=p."clientId" WHERE p.id=$1 FOR UPDATE OF p`,
      [projectId]
    );
    if (!project) throw new NotFoundException('Proyecto inexistente');
    if (project.archivedAt || project.clientArchivedAt) throw new ConflictException('Cliente o proyecto archivado');
  }

  private sessionTimes(
    dto: { startAt: string; endAt: string; prepMinutes?: number; cleanupMinutes?: number },
    defaults: any
  ) {
    const { startAt, endAt } = interval(dto.startAt, dto.endAt);
    if (startAt.getTime() < Date.now()) throw new BadRequestException('No se permiten reservas en el pasado');
    const prepMinutes = dto.prepMinutes ?? defaults.defaultPrepMinutes;
    const cleanupMinutes = dto.cleanupMinutes ?? defaults.defaultCleanupMinutes;
    return {
      startAt,
      endAt,
      prepMinutes,
      cleanupMinutes,
      occupiedStartAt: new Date(startAt.getTime() - prepMinutes * 60000),
      occupiedEndAt: new Date(endAt.getTime() + cleanupMinutes * 60000),
    };
  }

  private async conflict(m: EntityManager, entry: any, excludeId?: string) {
    const conflicts = await m.query(
      `SELECT id,kind,"startAt","endAt" FROM schedule_entry WHERE "agendaId"=1
      AND ${activePredicate} AND "occupiedStartAt"<$2 AND $1<"occupiedEndAt" AND ($3::uuid IS NULL OR id<>$3) ORDER BY "startAt"`,
      [entry.occupiedStartAt, entry.occupiedEndAt, excludeId || null]
    );
    if (conflicts.length)
      throw new ConflictException({ message: 'El horario está ocupado; elige otro intervalo', conflicts });
  }

  private async validateSession(m: EntityManager, settings: any, entry: any, excludeId?: string) {
    if (!withinWindow(entry, settings, await this.windows(m))) {
      throw new BadRequestException('Toda la sesión y sus márgenes deben entrar en una ventana laboral del mismo día');
    }
    await this.conflict(m, entry, excludeId);
  }

  createSession(actor: string, key: string, dto: CreateSessionDto) {
    return this.store.write(actor, 'session.create', key, dto, async (m, settings, requestId) => {
      await this.projectAvailable(m, dto.projectId);
      const times = this.sessionTimes(dto, settings);
      await this.validateSession(m, settings, times);
      const [row] = await m.query(
        `INSERT INTO schedule_entry
        (kind,"startAt","endAt","occupiedStartAt","occupiedEndAt","prepMinutes","cleanupMinutes","projectId",description,"sessionStatus")
        VALUES ('session',$1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *`,
        [
          times.startAt,
          times.endAt,
          times.occupiedStartAt,
          times.occupiedEndAt,
          times.prepMinutes,
          times.cleanupMinutes,
          dto.projectId,
          requiredText(dto.description, 'Descripción'),
        ]
      );
      await this.store.audit(m, actor, 'session', row.id, 'create', null, row, requestId);
      return row;
    });
  }

  private async entry(m: EntityManager, id: string, kind: string, version: number) {
    const [row] = await m.query('SELECT * FROM schedule_entry WHERE id=$1 AND kind=$2 FOR UPDATE', [id, kind]);
    this.store.checkVersion(row, version);
    return row;
  }

  reschedule(actor: string, key: string, id: string, dto: RescheduleDto) {
    return this.store.write(actor, `session.reschedule:${id}`, key, dto, async (m, settings, requestId) => {
      const before = await this.entry(m, id, 'session', dto.version);
      if (!['pending', 'confirmed'].includes(before.sessionStatus))
        throw new ConflictException('La sesión no permite reprogramación; usa la corrección explícita de estado');
      await this.projectAvailable(m, before.projectId);
      const times = this.sessionTimes(dto, {
        defaultPrepMinutes: before.prepMinutes,
        defaultCleanupMinutes: before.cleanupMinutes,
      });
      await this.validateSession(m, settings, times, id);
      const after = await updateReturning(
        m,
        `UPDATE schedule_entry SET "startAt"=$2,"endAt"=$3,"occupiedStartAt"=$4,"occupiedEndAt"=$5,
        "prepMinutes"=$6,"cleanupMinutes"=$7,version=version+1,"updatedAt"=now() WHERE id=$1 RETURNING *`,
        [
          id,
          times.startAt,
          times.endAt,
          times.occupiedStartAt,
          times.occupiedEndAt,
          times.prepMinutes,
          times.cleanupMinutes,
        ]
      );
      await this.store.audit(
        m,
        actor,
        'session',
        id,
        'reschedule',
        before,
        after,
        requestId,
        requiredText(dto.reason, 'Motivo')
      );
      return after;
    });
  }

  transition(
    actor: string,
    key: string,
    id: string,
    target: string,
    dto: VersionDto | ReasonDto | CorrectStatusDto,
    correction = false
  ) {
    return this.store.write(
      actor,
      `session.${correction ? 'correct' : target}:${id}`,
      key,
      dto,
      async (m, settings, requestId) => {
        const before = await this.entry(m, id, 'session', dto.version);
        const reason = 'reason' in dto ? requiredText(dto.reason, 'Motivo') : undefined;
        const allowed: Record<string, string[]> = {
          pending: ['confirmed', 'canceled'],
          confirmed: ['done', 'absent', 'canceled'],
        };
        if (correction) {
          if (!['done', 'absent', 'canceled'].includes(before.sessionStatus))
            throw new ConflictException('La corrección se reserva para estados terminales');
          if (!reason || target === before.sessionStatus)
            throw new BadRequestException('Indica un estado diferente y un motivo');
        } else if (!(allowed[before.sessionStatus] || []).includes(target)) {
          throw new ConflictException('Transición de estado no permitida');
        }
        if (['done', 'absent'].includes(target) && before.endAt.getTime() > Date.now())
          throw new BadRequestException('La sesión todavía no finalizó');
        if (target !== 'canceled') {
          if (['pending', 'confirmed'].includes(target)) {
            if (before.startAt.getTime() < Date.now())
              throw new BadRequestException('No se puede confirmar o reactivar un horario pasado');
            await this.projectAvailable(m, before.projectId);
            await this.validateSession(m, settings, before, id);
          } else {
            // Historical terminal corrections retain their original window and margins.
            await this.conflict(m, before, id);
          }
        }
        const cancellationReason = target === 'canceled' ? requiredText(reason, 'Motivo de cancelación') : null;
        const after = await updateReturning(
          m,
          `UPDATE schedule_entry SET "sessionStatus"=$2,"cancellationReason"=$3,version=version+1,"updatedAt"=now() WHERE id=$1 RETURNING *`,
          [id, target, cancellationReason]
        );
        await this.store.audit(
          m,
          actor,
          'session',
          id,
          correction ? 'correct-status' : target,
          before,
          after,
          requestId,
          reason
        );
        return after;
      }
    );
  }

  createBlock(actor: string, key: string, dto: CreateBlockDto) {
    return this.store.write(actor, 'block.create', key, dto, async (m, _, requestId) => {
      const times = interval(dto.startAt, dto.endAt);
      await this.conflict(m, { occupiedStartAt: times.startAt, occupiedEndAt: times.endAt });
      const [row] = await m.query(
        `INSERT INTO schedule_entry
        (kind,"startAt","endAt","occupiedStartAt","occupiedEndAt","prepMinutes","cleanupMinutes",reason,"blockActive")
        VALUES ('block',$1,$2,$1,$2,0,0,$3,true) RETURNING *`,
        [times.startAt, times.endAt, requiredText(dto.reason, 'Motivo')]
      );
      await this.store.audit(m, actor, 'block', row.id, 'create', null, row, requestId);
      return row;
    });
  }

  updateBlock(actor: string, key: string, id: string, dto: ChangeBlockDto) {
    return this.store.write(actor, `block.update:${id}`, key, dto, async (m, _, requestId) => {
      const before = await this.entry(m, id, 'block', dto.version);
      const times = interval(dto.startAt, dto.endAt);
      if (dto.active) await this.conflict(m, { occupiedStartAt: times.startAt, occupiedEndAt: times.endAt }, id);
      const after = await updateReturning(
        m,
        `UPDATE schedule_entry SET "startAt"=$2,"endAt"=$3,"occupiedStartAt"=$2,"occupiedEndAt"=$3,
        reason=$4,"blockActive"=$5,version=version+1,"updatedAt"=now() WHERE id=$1 RETURNING *`,
        [id, times.startAt, times.endAt, requiredText(dto.reason, 'Motivo'), dto.active]
      );
      await this.store.audit(m, actor, 'block', id, 'update', before, after, requestId, dto.reason);
      return after;
    });
  }

  async getEntry(id: string, kind: string) {
    const [entry] = await this.store.db.query('SELECT * FROM schedule_entry WHERE id=$1 AND kind=$2', [id, kind]);
    if (!entry) throw new NotFoundException('Registro inexistente');
    return entry;
  }

  private queryRange(m: EntityManager, from: Date, to: Date) {
    return m.query(
      `SELECT e.*,p.title AS "projectTitle",c.id AS "clientId",c.name AS "clientName"
      FROM schedule_entry e LEFT JOIN tattoo_project p ON p.id=e."projectId" LEFT JOIN client c ON c.id=p."clientId"
      WHERE e."occupiedStartAt"<$2 AND $1<e."occupiedEndAt" ORDER BY e."startAt",e.id`,
      [from, to]
    );
  }

  range(from: string, to: string) {
    const parsed = readRange(from, to);
    return this.store.db.transaction('REPEATABLE READ', async (m) => {
      const [settings] = await m.query('SELECT * FROM agenda_settings WHERE id=1');
      return {
        timezone: settings.timezone,
        from: parsed.startAt,
        to: parsed.endAt,
        entries: await this.queryRange(m, parsed.startAt, parsed.endAt),
      };
    });
  }

  day(date?: string) {
    return this.store.db.transaction('REPEATABLE READ', async (m) => {
      const [settings] = await m.query('SELECT * FROM agenda_settings WHERE id=1');
      const day = date || zoned(new Date(), settings.timezone).toPlainDate().toString();
      const { from, to } = dayRange(day, settings.timezone);
      return { timezone: settings.timezone, date: day, from, to, entries: await this.queryRange(m, from, to) };
    });
  }

  availability(date: string) {
    return this.store.db.transaction('REPEATABLE READ', async (m) => {
      const [settings] = await m.query('SELECT * FROM agenda_settings WHERE id=1');
      const day = localDate(date);
      const bounds = dayRange(date, settings.timezone);
      const windows = (await this.windows(m)).filter(
        (w) => w.weekday === day.dayOfWeek && w.validFrom <= date && (!w.validTo || date <= w.validTo)
      );
      const entries = await this.queryRange(m, bounds.from, bounds.to);
      const occupied = entries.filter((e) => (e.kind === 'session' ? e.sessionStatus !== 'canceled' : e.blockActive));
      const free: { startAt: Date; endAt: Date }[] = [];
      for (const w of windows) {
        // Reject ambiguous/nonexistent wall-clock window boundaries instead of silently shifting them.
        let start: number, end: number;
        try {
          start = day
            .toPlainDateTime(w.localStart)
            .toZonedDateTime(settings.timezone, { disambiguation: 'reject' }).epochMilliseconds;
          end = day
            .toPlainDateTime(w.localEnd)
            .toZonedDateTime(settings.timezone, { disambiguation: 'reject' }).epochMilliseconds;
        } catch {
          throw new BadRequestException('La ventana cae en una hora local ambigua o inexistente; configura otra hora');
        }
        let segments = [{ start, end }];
        for (const entry of occupied) {
          const a = entry.occupiedStartAt.getTime(),
            b = entry.occupiedEndAt.getTime();
          segments = segments.flatMap((s) => {
            if (a >= s.end || b <= s.start) return [s];
            return [
              a > s.start ? { start: s.start, end: a } : null,
              b < s.end ? { start: b, end: s.end } : null,
            ].filter(Boolean);
          });
        }
        free.push(...segments.map((s) => ({ startAt: new Date(s.start), endAt: new Date(s.end) })));
      }
      return {
        timezone: settings.timezone,
        date,
        ...bounds,
        defaultPrepMinutes: settings.defaultPrepMinutes,
        defaultCleanupMinutes: settings.defaultCleanupMinutes,
        free,
      };
    });
  }
}
