import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AgendaStore, updateReturning } from '../agenda/agenda-store.service';
import { ClientReminderDto, ReminderHistoryDto, ReminderSettingsDto, SessionReminderDto } from './reminder.dto';
import { reconcileReminders } from './reminder-planner';
import { internationalPhone, validateRules } from './reminder-time';

// Explicit projections keep destinations out of audit and history. Consent is bound to a destination.
function preferenceView(row: any) {
  return {
    clientId: row.clientId,
    enabled: row.enabled,
    version: row.version,
    hasPhone: !!row.phoneE164,
    consentedAt: row.consentedAt,
    consentSource: row.consentSource,
    consentedBy: row.consentedBy,
    revokedAt: row.revokedAt,
  };
}

@Injectable()
export class ReminderService {
  constructor(private readonly store: AgendaStore) {}
  async settings() {
    return this.store.db.transaction('REPEATABLE READ', async (m) => {
      const [row] = await m.query('SELECT r.*,a.timezone FROM reminder_settings r JOIN agenda_settings a ON a.id=r.id');
      return row;
    });
  }
  updateSettings(actor: string, key: string, dto: ReminderSettingsDto) {
    return this.store.write(actor, 'reminder.settings', key, dto, async (m, _, requestId) => {
      const [before] = await m.query('SELECT * FROM reminder_settings WHERE id=1 FOR UPDATE');
      this.store.checkVersion(before, dto.version);
      validateRules(dto.rules);
      if (dto.allowedEnd <= dto.allowedStart)
        throw new BadRequestException('La ventana debe terminar después del inicio');
      const after = await updateReturning(
        m,
        `UPDATE reminder_settings SET enabled=$1,rules=$2,"allowedStart"=$3,
        "allowedEnd"=$4,"graceMinutes"=$5,"maxAttempts"=$6,version=version+1 WHERE id=1 RETURNING *`,
        [dto.enabled, JSON.stringify(dto.rules), dto.allowedStart, dto.allowedEnd, dto.graceMinutes, dto.maxAttempts]
      );
      await reconcileReminders(m);
      // Template bodies are deliberately excluded from audit copies.
      const auditView = (r: any) => ({
        enabled: r.enabled,
        version: r.version,
        leads: r.rules.map((x) => x.leadMinutes),
        allowedStart: r.allowedStart,
        allowedEnd: r.allowedEnd,
        graceMinutes: r.graceMinutes,
        maxAttempts: r.maxAttempts,
      });
      await this.store.audit(
        m,
        actor,
        'reminder',
        'settings',
        'settings',
        auditView(before),
        auditView(after),
        requestId
      );
      return after;
    });
  }
  async preference(clientId: string) {
    const [client] = await this.store.db.query('SELECT id FROM client WHERE id=$1', [clientId]);
    if (!client) throw new NotFoundException('Cliente inexistente');
    const [row] = await this.store.db.query('SELECT * FROM client_reminder_preference WHERE "clientId"=$1', [clientId]);
    return row ? preferenceView(row) : { clientId, version: 0, enabled: false, hasPhone: false };
  }
  updatePreference(actor: string, key: string, clientId: string, dto: ClientReminderDto) {
    return this.store.write(actor, `reminder.client:${clientId}`, key, dto, async (m, _, requestId) => {
      const [client] = await m.query('SELECT id,"archivedAt" FROM client WHERE id=$1 FOR UPDATE', [clientId]);
      if (!client) throw new NotFoundException('Cliente inexistente');
      if (dto.enabled && client.archivedAt) throw new ConflictException('Cliente archivado');
      const [before] = await m.query('SELECT * FROM client_reminder_preference WHERE "clientId"=$1 FOR UPDATE', [
        clientId,
      ]);
      if ((before?.version || 0) !== dto.version) throw new ConflictException('Las preferencias cambiaron');
      const phone = dto.phoneE164 === undefined ? before?.phoneE164 || null : dto.phoneE164;
      const changed = phone !== before?.phoneE164;
      const accepting = dto.consentAccepted === true;
      if (accepting && (!internationalPhone(phone) || !dto.consentSource?.trim()))
        throw new BadRequestException('Indica destino internacional y origen de aceptación');
      const stillConsented = !changed && before?.consentedAt && !before?.revokedAt && dto.consentAccepted !== false;
      if (dto.enabled && (!internationalPhone(phone) || (!accepting && !stillConsented)))
        throw new BadRequestException('Hace falta aceptación explícita para este destino');
      const consentedAt = accepting ? new Date() : changed ? null : before?.consentedAt || null;
      const consentSource = accepting ? dto.consentSource.trim() : changed ? null : before?.consentSource || null;
      const consentedBy = accepting ? actor : changed ? null : before?.consentedBy || null;
      const revokedAt = accepting ? null : dto.consentAccepted === false ? new Date() : before?.revokedAt || null;
      const [after] = await m.query(
        `INSERT INTO client_reminder_preference
        ("clientId",enabled,"phoneE164","consentedAt","consentSource","consentedBy","revokedAt",version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT ("clientId") DO UPDATE SET enabled=EXCLUDED.enabled,
          "phoneE164"=EXCLUDED."phoneE164","consentedAt"=EXCLUDED."consentedAt","consentSource"=EXCLUDED."consentSource",
          "consentedBy"=EXCLUDED."consentedBy","revokedAt"=EXCLUDED."revokedAt",version=EXCLUDED.version RETURNING *`,
        [clientId, dto.enabled, phone, consentedAt, consentSource, consentedBy, revokedAt, dto.version + 1]
      );
      await reconcileReminders(m);
      await this.store.audit(
        m,
        actor,
        'reminder',
        clientId,
        'preference',
        before ? preferenceView(before) : null,
        preferenceView(after),
        requestId
      );
      return preferenceView(after);
    });
  }
  session(actor: string, key: string, entryId: string, dto: SessionReminderDto) {
    return this.store.write(actor, `reminder.session:${entryId}`, key, dto, async (m, _, requestId) => {
      const [before] = await m.query(`SELECT * FROM schedule_entry WHERE id=$1 AND kind='session' FOR UPDATE`, [
        entryId,
      ]);
      this.store.checkVersion(before, dto.version);
      const after = await updateReturning(
        m,
        `UPDATE schedule_entry SET "remindersDisabled"=$2,version=version+1,
        "updatedAt"=now() WHERE id=$1 RETURNING *`,
        [entryId, dto.disabled]
      );
      await reconcileReminders(m, entryId);
      await this.store.audit(
        m,
        actor,
        'reminder',
        entryId,
        'session-preference',
        { disabled: before.remindersDisabled, version: before.version },
        { disabled: after.remindersDisabled, version: after.version },
        requestId
      );
      return { entryId, disabled: after.remindersDisabled, version: after.version };
    });
  }
  history(dto: ReminderHistoryDto) {
    return this.store.db.query(
      `SELECT j.id,j."entryId",j.generation,j."leadMinutes",j."scheduledAt",j."expiresAt",
      j.state,j.attempts,j.reason,j.provider,j."providerMessageId",j."createdAt",j."updatedAt",
      count(*) OVER()::int AS "totalCount",coalesce((SELECT jsonb_agg(jsonb_build_object(
        'number',a.number,'provider',a.provider,'startedAt',a."startedAt",'finishedAt',a."finishedAt",
        'outcome',a.outcome,'reason',a.reason) ORDER BY a.number) FROM reminder_attempt a WHERE a."jobId"=j.id),'[]'::jsonb) AS "attemptHistory"
      FROM reminder_job j WHERE ($1::uuid IS NULL OR j."entryId"=$1) AND ($2::text IS NULL OR j.state=$2)
      ORDER BY j."createdAt" DESC,j.id LIMIT $3 OFFSET $4`,
      [dto.entryId || null, dto.state || null, dto.limit, (dto.page - 1) * dto.limit]
    );
  }
}
