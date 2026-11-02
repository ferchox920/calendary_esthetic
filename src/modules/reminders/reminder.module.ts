import { Module } from '@nestjs/common';
import { AgendaStore } from '../agenda/agenda-store.service';
import { ReminderController } from './reminder.controller';
import {
  DisabledReminderProvider,
  ReminderProvider,
  reminderRuntime,
  SimulatedReminderProvider,
} from './reminder-provider';
import { ReminderService } from './reminder.service';
import { ReminderClock, ReminderWorker } from './reminder-worker.service';
import { BaileysReminderProvider } from './baileys-provider';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppGateway } from './whatsapp.gateway';
import { WhatsAppService } from './whatsapp.service';
import { ReminderReconciliation } from './reminder-reconciliation.service';

@Module({
  controllers: [ReminderController, WhatsAppController],
  providers: [
    AgendaStore,
    ReminderService,
    ReminderClock,
    ReminderWorker,
    ReminderReconciliation,
    WhatsAppGateway,
    WhatsAppService,
    {
      provide: ReminderProvider,
      useFactory: () => {
        const provider = reminderRuntime(process.env).provider;
        return provider === 'baileys'
          ? new BaileysReminderProvider()
          : provider === 'simulated'
            ? new SimulatedReminderProvider()
            : new DisabledReminderProvider();
      },
    },
  ],
})
export class RemindersModule {}
