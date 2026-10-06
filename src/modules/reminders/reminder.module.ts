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

@Module({
  controllers: [ReminderController],
  providers: [
    AgendaStore,
    ReminderService,
    ReminderClock,
    ReminderWorker,
    {
      provide: ReminderProvider,
      useFactory: () =>
        reminderRuntime(process.env).provider === 'simulated'
          ? new SimulatedReminderProvider()
          : new DisabledReminderProvider(),
    },
  ],
})
export class RemindersModule {}
