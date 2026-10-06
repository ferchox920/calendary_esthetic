import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { allowedAt, internationalPhone, nextAllowed, ReminderSettings, renderReminder } from './reminder-time';
import { ReminderNotAccepted, ReminderProvider, reminderRuntime } from './reminder-provider';

@Injectable()
export class ReminderClock {
  now(): Date {
    return new Date();
  }
}

@Injectable()
export class ReminderWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(ReminderWorker.name);
  constructor(
    private readonly db: DataSource,
    private readonly provider: ReminderProvider,
    private readonly clock: ReminderClock
  ) {}
  onApplicationBootstrap() {
    if (!reminderRuntime(process.env).workerEnabled) return;
    const tick = () => {
      void this.runOnce().catch(() => this.logger.warn('No se pudo procesar la cola de recordatorios'));
    };
    this.timer = setInterval(tick, 15000);
    this.timer.unref();
    tick();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  status() {
    return {
      provider: this.provider.name,
      available: this.provider.available(),
      workerEnabled: reminderRuntime(process.env).workerEnabled,
      simulated: this.provider.name === 'simulated',
    };
  }
  async runOnce(limit = 20) {
    if (this.running) return;
    this.running = true;
    try {
      await this.recover();
      if (!this.provider.available()) return;
      for (let i = 0; i < limit; i++) {
        const claimed = await this.claim();
        if (!claimed) break;
        const message = await this.begin(claimed);
        if (message) await this.dispatch(message);
      }
    } finally {
      this.running = false;
    }
  }
  private recover() {
    return this.db.transaction(async (m) => {
      await m.query('SELECT id FROM agenda_settings WHERE id=1 FOR UPDATE');
      const now = this.clock.now();
      const expired = await m.query(
        `SELECT * FROM reminder_job WHERE state='processing' AND "lockedUntil"<=$1 FOR UPDATE`,
        [now]
      );
      for (const job of expired) {
        const uncertain = job.dispatchStartedAt !== null;
        await m.query(
          `UPDATE reminder_attempt SET outcome='uncertain',reason='worker_interrupted',"finishedAt"=$2
          WHERE "jobId"=$1 AND outcome='started'`,
          [job.id, now]
        );
        await m.query(
          `UPDATE reminder_job SET state=$2,reason=$3,"lockToken"=NULL,"lockedUntil"=NULL,"updatedAt"=$4
          WHERE id=$1`,
          [job.id, uncertain ? 'uncertain' : 'pending', uncertain ? 'worker_interrupted' : null, now]
        );
      }
      await m.query(
        `UPDATE reminder_job SET state='canceled',reason='expired',"updatedAt"=$1
        WHERE state='pending' AND "expiresAt"<$1`,
        [now]
      );
    });
  }
  private claim() {
    return this.db.transaction(async (m) => {
      // Same lock order as all agenda mutations; never keep this transaction open over network I/O.
      await m.query('SELECT id FROM agenda_settings WHERE id=1 FOR UPDATE');
      const now = this.clock.now();
      const [job] = await m.query(
        `SELECT * FROM reminder_job WHERE state='pending' AND "nextAttemptAt"<=$1
        AND "expiresAt">=$1 ORDER BY "nextAttemptAt",id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [now]
      );
      if (!job) return null;
      const token = randomUUID();
      await m.query(
        `UPDATE reminder_job SET state='processing',"lockToken"=$2,"lockedUntil"=$3,"updatedAt"=$4 WHERE id=$1`,
        [job.id, token, new Date(now.getTime() + 60000), now]
      );
      return { id: job.id, token };
    });
  }
  private begin(claim: { id: string; token: string }) {
    return this.db.transaction(async (m) => {
      const [agenda] = await m.query('SELECT * FROM agenda_settings WHERE id=1 FOR UPDATE');
      const [job] = await m.query(
        `SELECT * FROM reminder_job WHERE id=$1 AND "lockToken"=$2 AND state='processing' FOR UPDATE`,
        [claim.id, claim.token]
      );
      if (!job) return null;
      const now = this.clock.now();
      const [settings]: ReminderSettings[] = await m.query('SELECT * FROM reminder_settings WHERE id=1');
      const [entry] = await m.query(
        `SELECT e.*,p."archivedAt" AS "projectArchivedAt",c."archivedAt" AS "clientArchivedAt",
        r.enabled AS "clientEnabled",r."phoneE164",r."consentedAt",r."revokedAt",r.version AS "preferenceVersion"
        FROM schedule_entry e JOIN tattoo_project p ON p.id=e."projectId" JOIN client c ON c.id=p."clientId"
        LEFT JOIN client_reminder_preference r ON r."clientId"=c.id WHERE e.id=$1`,
        [job.entryId]
      );
      const rule = settings.rules.find((r) => r.leadMinutes === job.leadMinutes);
      const invalid =
        !entry ||
        !settings.enabled ||
        !rule ||
        entry.sessionStatus !== 'confirmed' ||
        entry.remindersDisabled ||
        entry.projectArchivedAt ||
        entry.clientArchivedAt ||
        !entry.clientEnabled ||
        !entry.consentedAt ||
        entry.revokedAt ||
        !internationalPhone(entry.phoneE164) ||
        entry.startAt <= now ||
        job.expiresAt < now ||
        job.lockedUntil <= now ||
        entry.reminderGeneration !== job.generation ||
        settings.version !== job.settingsVersion ||
        entry.preferenceVersion !== job.preferenceVersion ||
        agenda.timezone !== job.timezone;
      if (invalid || job.attempts >= settings.maxAttempts) {
        await m.query(
          `UPDATE reminder_job SET state=$2,reason=$3,"lockToken"=NULL,"lockedUntil"=NULL,"updatedAt"=$4 WHERE id=$1`,
          [job.id, invalid ? 'canceled' : 'failed', invalid ? 'eligibility_changed' : 'retry_limit', now]
        );
        return null;
      }
      if (!allowedAt(now, settings, agenda.timezone)) {
        const next = nextAllowed(now, settings, agenda.timezone);
        const canWait = next <= job.expiresAt && next < entry.startAt;
        await m.query(
          `UPDATE reminder_job SET state=$2,reason=$3,"nextAttemptAt"=$4,"lockToken"=NULL,
          "lockedUntil"=NULL,"updatedAt"=$5 WHERE id=$1`,
          [job.id, canWait ? 'pending' : 'canceled', canWait ? null : 'no_allowed_window', next, now]
        );
        return null;
      }
      const attemptId = randomUUID();
      await m.query(`INSERT INTO reminder_attempt (id,"jobId",number,provider,"startedAt") VALUES ($1,$2,$3,$4,$5)`, [
        attemptId,
        job.id,
        job.attempts + 1,
        this.provider.name,
        now,
      ]);
      await m.query(
        `UPDATE reminder_job SET attempts=attempts+1,"dispatchStartedAt"=$2,provider=$3,"updatedAt"=$2 WHERE id=$1`,
        [job.id, now, this.provider.name]
      );
      return {
        attemptId,
        jobId: job.id,
        token: claim.token,
        phoneE164: entry.phoneE164 as string,
        text: renderReminder(rule.template, entry.startAt, agenda.timezone),
        maxAttempts: settings.maxAttempts,
        attemptNumber: job.attempts + 1,
        expiresAt: job.expiresAt as Date,
      };
    });
  }
  private async dispatch(message: NonNullable<Awaited<ReturnType<ReminderWorker['begin']>>>) {
    let outcome: 'accepted' | 'not_accepted' | 'uncertain' = 'uncertain';
    let retryable = false;
    let messageId: string = null;
    let timeout: ReturnType<typeof setTimeout>;
    try {
      const result = await Promise.race([
        this.provider.send({ attemptId: message.attemptId, phoneE164: message.phoneE164, text: message.text }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('timeout')), 20000);
        }),
      ]);
      if (
        result?.accepted !== true ||
        (result.messageId !== undefined &&
          (typeof result.messageId !== 'string' || !result.messageId || result.messageId.length > 200))
      )
        throw new Error('unknown');
      outcome = 'accepted';
      messageId = result.messageId || null;
    } catch (error) {
      if (error instanceof ReminderNotAccepted) {
        outcome = 'not_accepted';
        retryable = error.retryable;
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    // A database failure here propagates. Do not turn an accepted/unknown send into a retry.
    await this.db.transaction(async (m) => {
      await m.query('SELECT id FROM agenda_settings WHERE id=1 FOR UPDATE');
      const [job] = await m.query(
        `SELECT * FROM reminder_job WHERE id=$1 AND "lockToken"=$2 AND state='processing' FOR UPDATE`,
        [message.jobId, message.token]
      );
      if (!job) return;
      const now = this.clock.now();
      const next = new Date(now.getTime() + Math.min(900, 15 * 2 ** (message.attemptNumber - 1)) * 1000);
      const retry =
        outcome === 'not_accepted' &&
        retryable &&
        message.attemptNumber < message.maxAttempts &&
        next <= message.expiresAt;
      const state =
        outcome === 'accepted' ? 'sent' : outcome === 'uncertain' ? 'uncertain' : retry ? 'pending' : 'failed';
      const reason = outcome === 'accepted' ? null : outcome === 'uncertain' ? 'acceptance_unknown' : 'not_accepted';
      await m.query(
        `UPDATE reminder_attempt SET outcome=$2,reason=$3,"finishedAt"=$4 WHERE id=$1 AND outcome='started'`,
        [message.attemptId, outcome, reason, now]
      );
      await m.query(
        `UPDATE reminder_job SET state=$2::varchar,reason=$3,"providerMessageId"=$4,"nextAttemptAt"=$5,
        "dispatchStartedAt"=CASE WHEN $2::varchar='pending' THEN NULL ELSE "dispatchStartedAt" END,
        "lockToken"=NULL,"lockedUntil"=NULL,"updatedAt"=$6 WHERE id=$1`,
        [job.id, state, reason, messageId, next, now]
      );
    });
  }
}
