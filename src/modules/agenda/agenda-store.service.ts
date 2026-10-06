import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { queueGoogleEntries } from '../google/google-outbox';
import { reconcileReminders } from '../reminders/reminder-planner';

export function requiredText(value: string, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${field} es obligatorio`);
  return value.trim();
}

// The PostgreSQL TypeORM driver returns UPDATE as [rows, affectedCount], unlike INSERT/SELECT.
export async function updateReturning(manager: EntityManager, sql: string, parameters: unknown[] = []) {
  const [rows] = await manager.query(sql, parameters);
  return rows[0];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class AgendaStore {
  constructor(readonly db: DataSource) {}

  async write<T>(
    actorId: string,
    operation: string,
    key: string,
    payload: unknown,
    action: (manager: EntityManager, settings: any, requestId: string) => Promise<T>
  ): Promise<T> {
    if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
      throw new BadRequestException('Idempotency-Key obligatorio (8–128 caracteres)');
    }
    const hash = createHash('sha256').update(canonical(payload)).digest('hex');
    try {
      return await this.db.transaction(async (manager) => {
        const [settings] = await manager.query('SELECT * FROM agenda_settings WHERE id = 1 FOR UPDATE');
        if (!settings) throw new ConflictException('Agenda sin configurar');
        const [previous] = await manager.query(
          'SELECT * FROM idempotency_record WHERE "ownerId" = $1 AND operation = $2 AND key = $3',
          [actorId, operation, key]
        );
        if (previous) {
          if (previous.payloadHash !== hash) throw new ConflictException('La clave ya se usó con otros datos');
          return previous.response;
        }
        const response = await action(manager, settings, randomUUID());
        await manager.query(
          'INSERT INTO idempotency_record ("ownerId", operation, key, "payloadHash", response) VALUES ($1,$2,$3,$4,$5)',
          [actorId, operation, key, hash, JSON.stringify(response)]
        );
        // Return the same JSON representation for both the first call and subsequent retries.
        return JSON.parse(JSON.stringify(response));
      });
    } catch (error) {
      const databaseError = error as { code?: string; driverError?: { code?: string } };
      if (databaseError.code === '23P01' || databaseError.driverError?.code === '23P01') {
        throw new ConflictException('El horario está ocupado; elige otro intervalo');
      }
      throw error;
    }
  }

  async audit(
    manager: EntityManager,
    actorId: string,
    entityType: string,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
    requestId: string,
    reason?: string
  ) {
    if (entityType === 'session') {
      if (action === 'reschedule' || action === 'correct-status') {
        await manager.query('UPDATE schedule_entry SET "reminderGeneration"="reminderGeneration"+1 WHERE id=$1', [
          entityId,
        ]);
        // Keep responses/audit snapshots consistent with the persisted generation.
        if (after && typeof after === 'object') (after as any).reminderGeneration++;
      }
      await reconcileReminders(manager, entityId);
    }
    if (
      (entityType === 'agenda' && action === 'settings') ||
      (entityType === 'client' && action === 'archive') ||
      (entityType === 'project' && action === 'archive')
    ) {
      await reconcileReminders(manager);
    }
    if (entityType === 'session' || entityType === 'block') await queueGoogleEntries(manager, actorId, entityId);
    if (entityType === 'agenda' && action === 'settings') await queueGoogleEntries(manager, actorId);
    await manager.query(
      `INSERT INTO audit_event ("actorId","entityType","entityId",action,"before","after","requestId",reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        actorId,
        entityType,
        entityId,
        action,
        before == null ? null : JSON.stringify(before),
        after == null ? null : JSON.stringify(after),
        requestId,
        reason || null,
      ]
    );
  }

  checkVersion(record: any, version: number) {
    if (!record) throw new NotFoundException('Registro inexistente');
    if (record.version !== version) throw new ConflictException('El registro cambió; actualiza antes de guardar');
  }
}
