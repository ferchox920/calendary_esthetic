import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgendaStore } from '../agenda/agenda-store.service';
import { ReminderClock } from './reminder-worker.service';
import { WhatsAppGateway } from './whatsapp.gateway';

export function receiptEvidence(value: any, attemptId: string): 'accepted' | 'not_accepted' | undefined {
  if (!value || value.attemptId !== attemptId || value.durable !== true) return;
  if (value.state === 'accepted' && typeof value.messageId === 'string' && /^3EB0[A-F0-9]{36}$/.test(value.messageId))
    return 'accepted';
  if (value.state === 'not_accepted' && typeof value.retryable === 'boolean') return 'not_accepted';
}

@Injectable()
export class ReminderReconciliation {
  constructor(
    private readonly store: AgendaStore,
    private readonly gateway: WhatsAppGateway,
    private readonly clock: ReminderClock
  ) {}
  async reconcile(actorId: string, key: string, jobId: string) {
    let created = false;
    const operation = `reminder.reconcile:${jobId}`;
    const registered = await this.store.write(actorId, operation, key, {}, async (m, _settings, requestId) => {
      const [job] = await m.query('SELECT * FROM reminder_job WHERE id=$1 FOR UPDATE', [jobId]);
      if (!job) throw new NotFoundException('Recordatorio inexistente');
      const [attempt] = await m.query(
        'SELECT * FROM reminder_attempt WHERE "jobId"=$1 ORDER BY number DESC LIMIT 1 FOR UPDATE',
        [jobId]
      );
      const now = this.clock.now();
      if (job.state === 'processing') {
        if (
          !job.lockedUntil ||
          job.lockedUntil > now ||
          !job.dispatchStartedAt ||
          !attempt ||
          attempt.outcome !== 'started'
        )
          throw new ConflictException('El envío sigue en proceso; espera su resultado o el vencimiento del bloqueo');
        await m.query(
          `UPDATE reminder_attempt SET outcome='uncertain',reason='worker_interrupted',"finishedAt"=$2 WHERE id=$1`,
          [attempt.id, now]
        );
        await m.query(
          `UPDATE reminder_job SET state='uncertain',reason='worker_interrupted',"lockToken"=NULL,"lockedUntil"=NULL,"updatedAt"=$2 WHERE id=$1`,
          [jobId, now]
        );
        await this.store.audit(
          m,
          actorId,
          'reminder',
          jobId,
          'reconciliation-recovered',
          { state: 'processing', attemptId: attempt.id },
          { state: 'uncertain', attemptId: attempt.id },
          requestId
        );
        job.state = 'uncertain';
        attempt.outcome = 'uncertain';
      }
      if (job.state !== 'uncertain') return { jobId, state: job.state, changed: false, result: 'not_uncertain' };
      if (!attempt || attempt.outcome !== 'uncertain')
        throw new ConflictException('No hay un intento incierto consistente para reconciliar');
      if (attempt.provider !== 'baileys' || job.provider !== 'baileys')
        return { jobId, state: 'uncertain', changed: false, result: 'provider_unsupported' };
      const response = { jobId, attemptId: attempt.id, state: 'registered' };
      await this.store.audit(
        m,
        actorId,
        'reminder',
        jobId,
        'reconciliation-requested',
        null,
        { attemptId: attempt.id },
        requestId
      );
      created = true;
      return response;
    });
    // Same key returns its previous observation. Use a new key for a new receipt lookup.
    if (!created || !('attemptId' in registered))
      return registered.state === 'registered'
        ? { jobId, state: 'uncertain', changed: false, result: 'reconciliation_in_progress' }
        : registered;
    let evidence: ReturnType<typeof receiptEvidence>,
      messageId: string,
      observation = 'no_conclusive_receipt';
    try {
      const value = await this.gateway.sendReceipt(registered.attemptId);
      evidence = receiptEvidence(value, registered.attemptId);
      if (evidence === 'accepted') messageId = value.messageId;
    } catch (error) {
      observation = error instanceof NotFoundException ? 'receipt_missing' : 'bridge_unavailable';
    }
    // Receipt lookup is GET only and outside all agenda transactions.
    return this.store.db.transaction(async (m) => {
      await m.query('SELECT id FROM agenda_settings WHERE id=1 FOR UPDATE');
      const [job] = await m.query('SELECT * FROM reminder_job WHERE id=$1 FOR UPDATE', [jobId]);
      const [attempt] = await m.query(
        'SELECT * FROM reminder_attempt WHERE "jobId"=$1 ORDER BY number DESC LIMIT 1 FOR UPDATE',
        [jobId]
      );
      let result;
      if (!job) throw new NotFoundException('Recordatorio inexistente');
      const current =
        job.state === 'uncertain' &&
        attempt?.id === registered.attemptId &&
        attempt.outcome === 'uncertain' &&
        attempt.provider === 'baileys' &&
        job.provider === 'baileys';
      if (current && evidence) {
        const state = evidence === 'accepted' ? 'sent' : 'failed',
          reason = evidence === 'accepted' ? 'receipt_accepted' : 'receipt_not_accepted';
        const now = this.clock.now();
        await m.query('UPDATE reminder_attempt SET outcome=$2,reason=$3,"reconciledAt"=$4 WHERE id=$1', [
          attempt.id,
          evidence,
          reason,
          now,
        ]);
        await m.query(
          'UPDATE reminder_job SET state=$2,reason=$3,"providerMessageId"=$4,"updatedAt"=$5,"lockToken"=NULL,"lockedUntil"=NULL WHERE id=$1',
          [jobId, state, reason, messageId || null, now]
        );
        result = {
          jobId,
          attemptId: attempt.id,
          state,
          changed: true,
          result: reason,
          reconciledAt: now.toISOString(),
        };
        await this.store.audit(
          m,
          actorId,
          'reminder',
          jobId,
          'reconciled',
          { state: 'uncertain', attemptId: attempt.id, outcome: 'uncertain' },
          { ...result, outcome: evidence },
          randomUUID()
        );
      } else {
        result = {
          jobId,
          attemptId: registered.attemptId,
          state: job.state,
          changed: false,
          result: current ? observation : 'state_changed',
        };
        await this.store.audit(m, actorId, 'reminder', jobId, 'reconciliation-unresolved', null, result, randomUUID());
      }
      await m.query('UPDATE idempotency_record SET response=$4 WHERE "ownerId"=$1 AND operation=$2 AND key=$3', [
        actorId,
        operation,
        key,
        JSON.stringify(result),
      ]);
      return result;
    });
  }
}
