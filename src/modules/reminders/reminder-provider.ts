import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface ReminderMessage {
  attemptId: string;
  phoneE164: string;
  text: string;
}
export interface ReminderAccepted {
  accepted: true;
  messageId?: string;
}
export abstract class ReminderProvider {
  abstract readonly name: string;
  abstract available(): boolean;
  abstract send(message: ReminderMessage): Promise<ReminderAccepted>;
}

// Only use this when the adapter can prove the provider did not accept this attempt.
export class ReminderNotAccepted extends Error {
  constructor(readonly retryable: boolean) {
    super('not_accepted');
  }
}

@Injectable()
export class DisabledReminderProvider extends ReminderProvider {
  readonly name = 'disabled';
  available() {
    return false;
  }
  async send(): Promise<ReminderAccepted> {
    throw new ReminderNotAccepted(false);
  }
}

@Injectable()
export class SimulatedReminderProvider extends ReminderProvider {
  readonly name = 'simulated';
  available() {
    return true;
  }
  async send(): Promise<ReminderAccepted> {
    return { accepted: true, messageId: `simulated-${randomUUID()}` };
  }
}

export function reminderRuntime(env: NodeJS.ProcessEnv) {
  const enabled = env.REMINDERS_WORKER_ENABLED ?? 'false';
  const provider = env.REMINDERS_PROVIDER ?? 'disabled';
  if (!['true', 'false'].includes(enabled) || !['disabled', 'simulated'].includes(provider))
    throw new Error('Invalid reminder runtime configuration');
  if (provider === 'simulated' && !['development', 'test'].includes(env.NODE_ENV))
    throw new Error('Simulated reminders are restricted to development/test');
  return { workerEnabled: enabled === 'true', provider };
}
