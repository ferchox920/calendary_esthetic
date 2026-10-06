import { EntityManager } from 'typeorm';
import { internationalPhone, nextAllowed, ReminderSettings } from './reminder-time';

// Called inside AgendaStore.write, after its agenda_settings lock. No network or message payloads.
export async function reconcileReminders(m: EntityManager, entryId?: string, now = new Date()) {
  const [settings]: ReminderSettings[] = await m.query('SELECT * FROM reminder_settings WHERE id=1');
  const [agenda] = await m.query('SELECT timezone FROM agenda_settings WHERE id=1');
  const entries = await m.query(
    `SELECT e.*,p."archivedAt" AS "projectArchivedAt",c."archivedAt" AS "clientArchivedAt",
    r.enabled AS "clientEnabled",r."phoneE164",r."consentedAt",r."revokedAt",r.version AS "preferenceVersion"
    FROM schedule_entry e JOIN tattoo_project p ON p.id=e."projectId" JOIN client c ON c.id=p."clientId"
    LEFT JOIN client_reminder_preference r ON r."clientId"=c.id
    WHERE e.kind='session' AND ($1::uuid IS NULL OR e.id=$1)
      AND (e."startAt">$2 OR EXISTS (SELECT 1 FROM reminder_job j WHERE j."entryId"=e.id AND j.state IN ('pending','processing')))
    ORDER BY e.id`,
    [entryId || null, now]
  );
  for (const entry of entries) {
    const eligible =
      settings.enabled &&
      entry.sessionStatus === 'confirmed' &&
      !entry.remindersDisabled &&
      !entry.projectArchivedAt &&
      !entry.clientArchivedAt &&
      entry.clientEnabled &&
      entry.consentedAt &&
      !entry.revokedAt &&
      internationalPhone(entry.phoneE164) &&
      entry.startAt > now;
    const leads = eligible ? settings.rules.map((r) => r.leadMinutes) : [];
    await m.query(
      `UPDATE reminder_job SET state='canceled',reason='eligibility_changed',"lockToken"=NULL,
      "lockedUntil"=NULL,"updatedAt"=$4 WHERE "entryId"=$1 AND state IN ('pending','processing')
      AND "dispatchStartedAt" IS NULL AND (generation<>$2 OR NOT ("leadMinutes"=ANY($3::int[])))`,
      [entry.id, entry.reminderGeneration, leads, now]
    );
    if (!eligible) continue;
    const existing = await m.query(
      'SELECT "leadMinutes",state FROM reminder_job WHERE "entryId"=$1 AND generation=$2',
      [entry.id, entry.reminderGeneration]
    );
    for (const rule of settings.rules) {
      const nominal = new Date(entry.startAt.getTime() - rule.leadMinutes * 60000);
      const scheduled = nextAllowed(nominal, settings, agenda.timezone);
      const active = existing.some(
        (j) => j.leadMinutes === rule.leadMinutes && ['pending', 'processing'].includes(j.state)
      );
      const reason =
        nominal < now && !active ? 'confirmed_too_late' : scheduled >= entry.startAt ? 'no_allowed_window' : null;
      const expires = new Date(
        Math.max(
          scheduled.getTime(),
          Math.min(scheduled.getTime() + settings.graceMinutes * 60000, entry.startAt.getTime() - 1)
        )
      );
      await m.query(
        `INSERT INTO reminder_job
        ("entryId",generation,"leadMinutes","settingsVersion","preferenceVersion",timezone,"scheduledAt","expiresAt","nextAttemptAt",state,reason)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7,$9,$10)
        ON CONFLICT ("entryId",generation,"leadMinutes") DO UPDATE SET
          "settingsVersion"=EXCLUDED."settingsVersion","preferenceVersion"=EXCLUDED."preferenceVersion",
          timezone=EXCLUDED.timezone,"scheduledAt"=EXCLUDED."scheduledAt","expiresAt"=EXCLUDED."expiresAt",
          "nextAttemptAt"=CASE WHEN reminder_job.attempts=0 THEN EXCLUDED."nextAttemptAt" ELSE reminder_job."nextAttemptAt" END,
          state=EXCLUDED.state,reason=EXCLUDED.reason,"lockToken"=NULL,"lockedUntil"=NULL,"updatedAt"=$11
        WHERE reminder_job.state IN ('pending','canceled','processing') AND reminder_job."dispatchStartedAt" IS NULL
          AND (reminder_job.state<>'canceled' OR reminder_job.attempts=0)`,
        [
          entry.id,
          entry.reminderGeneration,
          rule.leadMinutes,
          settings.version,
          entry.preferenceVersion,
          agenda.timezone,
          scheduled,
          expires,
          reason ? 'canceled' : 'pending',
          reason,
          now,
        ]
      );
    }
  }
}
