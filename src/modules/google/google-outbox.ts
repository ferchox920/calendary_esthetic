import { EntityManager } from 'typeorm';

export async function queueGoogleEntries(manager: EntityManager, ownerId?: string, entryId?: string) {
  await manager.query(
    `INSERT INTO google_sync_job ("entryId","ownerId")
    SELECT e.id,c."ownerId" FROM schedule_entry e CROSS JOIN google_connection c
    WHERE c."calendarEnabled" AND NOT c."needsReconnect"
      AND ($1::uuid IS NULL OR c."ownerId"=$1) AND ($2::uuid IS NULL OR e.id=$2)
    ORDER BY e.id
    ON CONFLICT ("entryId") DO UPDATE SET revision=google_sync_job.revision+1,attempts=0,
      "nextAttemptAt"=now(),"lastError"=NULL`,
    [ownerId || null, entryId || null]
  );
}

export function googleEvent(entry: any, timezone: string, settingsVersion: number) {
  const labels = {
    pending: 'Pendiente',
    confirmed: 'Confirmado',
    done: 'Realizado',
    absent: 'Ausente',
    canceled: 'Cancelado',
  };
  const active = entry.kind === 'session' ? entry.sessionStatus !== 'canceled' : entry.blockActive;
  return {
    summary:
      entry.kind === 'session'
        ? `Turno · ${labels[entry.sessionStatus]}`
        : active
          ? 'No disponible'
          : 'Bloqueo desactivado',
    description:
      entry.kind === 'session'
        ? `Gestioná cambios desde la agenda de Gabriela. Preparación: ${entry.prepMinutes} min. Limpieza: ${entry.cleanupMinutes} min.`
        : 'Gestioná este bloqueo desde la agenda de Gabriela.',
    start: { dateTime: new Date(entry.startAt).toISOString(), timeZone: timezone },
    end: { dateTime: new Date(entry.endAt).toISOString(), timeZone: timezone },
    status: 'confirmed',
    transparency: active ? 'opaque' : 'transparent',
    visibility: 'private',
    reminders: { useDefault: false },
    extendedProperties: {
      private: {
        agendaEntryId: entry.id,
        agendaEntryVersion: String(entry.version),
        agendaSettingsVersion: String(settingsVersion),
      },
    },
  };
}

export function googleEventId(entryId: string) {
  return `ag${entryId.replace(/-/g, '')}`;
}
