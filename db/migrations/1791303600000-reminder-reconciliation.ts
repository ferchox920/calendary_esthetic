import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReminderReconciliation1791303600000 implements MigrationInterface {
  name = 'ReminderReconciliation1791303600000';
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE reminder_attempt ADD COLUMN "reconciledAt" timestamptz');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE reminder_attempt DROP COLUMN "reconciledAt"');
  }
}
