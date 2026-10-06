import { MigrationInterface, QueryRunner } from 'typeorm';

export class Reminders1791302400000 implements MigrationInterface {
  name = 'Reminders1791302400000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE schedule_entry ADD COLUMN "remindersDisabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN "reminderGeneration" integer NOT NULL DEFAULT 1 CHECK ("reminderGeneration">0)`);
    await q.query(`CREATE TABLE reminder_settings (
      id smallint PRIMARY KEY REFERENCES agenda_settings(id) CHECK (id=1), enabled boolean NOT NULL DEFAULT false,
      rules jsonb NOT NULL CHECK (jsonb_typeof(rules)='array' AND jsonb_array_length(rules) BETWEEN 1 AND 5),
      "allowedStart" varchar(5) NOT NULL DEFAULT '09:00' CHECK ("allowedStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
      "allowedEnd" varchar(5) NOT NULL DEFAULT '20:00' CHECK ("allowedEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
      "graceMinutes" integer NOT NULL DEFAULT 30 CHECK ("graceMinutes" BETWEEN 0 AND 240),
      "maxAttempts" integer NOT NULL DEFAULT 3 CHECK ("maxAttempts" BETWEEN 1 AND 5),
      version integer NOT NULL DEFAULT 1 CHECK (version>0), CHECK ("allowedStart"<"allowedEnd")
    )`);
    await q.query(`INSERT INTO reminder_settings (id,rules) VALUES (1,
      '[{"leadMinutes":1440,"template":"Recordatorio de tu turno: {{date}} a las {{time}} ({{timezone}})."},
        {"leadMinutes":120,"template":"Recordatorio de tu turno: {{date}} a las {{time}} ({{timezone}})."}]')`);
    await q.query(`CREATE TABLE client_reminder_preference (
      "clientId" uuid PRIMARY KEY REFERENCES client(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT false, "phoneE164" varchar(16), "consentedAt" timestamptz,
      "consentSource" varchar(120), "consentedBy" uuid REFERENCES owner_account(id) ON DELETE CASCADE,
      "revokedAt" timestamptz, version integer NOT NULL DEFAULT 1 CHECK (version>0),
      CHECK ("phoneE164" IS NULL OR "phoneE164" ~ '^[+][1-9][0-9]{7,14}$'),
      CHECK (NOT enabled OR ("phoneE164" IS NOT NULL AND "consentedAt" IS NOT NULL AND
        "consentSource" IS NOT NULL AND "consentedBy" IS NOT NULL AND "revokedAt" IS NULL))
    )`);
    await q.query(`CREATE TABLE reminder_job (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "entryId" uuid NOT NULL REFERENCES schedule_entry(id) ON DELETE CASCADE,
      generation integer NOT NULL CHECK (generation>0), "leadMinutes" integer NOT NULL CHECK ("leadMinutes" BETWEEN 1 AND 10080),
      "settingsVersion" integer NOT NULL, "preferenceVersion" integer NOT NULL, timezone varchar(100) NOT NULL,
      "scheduledAt" timestamptz NOT NULL, "expiresAt" timestamptz NOT NULL, "nextAttemptAt" timestamptz NOT NULL,
      state varchar(12) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','sent','failed','canceled','uncertain')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0), "lockToken" uuid, "lockedUntil" timestamptz,
      "dispatchStartedAt" timestamptz, "providerMessageId" varchar(200), provider varchar(30), reason varchar(80),
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("entryId",generation,"leadMinutes"), CHECK ("expiresAt">="scheduledAt")
    )`);
    await q.query(`CREATE INDEX reminder_due_idx ON reminder_job ("nextAttemptAt",id) WHERE state='pending'`);
    await q.query(`CREATE INDEX reminder_lease_idx ON reminder_job ("lockedUntil") WHERE state='processing'`);
    await q.query(`CREATE TABLE reminder_attempt (
      id uuid PRIMARY KEY, "jobId" uuid NOT NULL REFERENCES reminder_job(id) ON DELETE CASCADE,
      number integer NOT NULL CHECK (number>0), provider varchar(30) NOT NULL,
      "startedAt" timestamptz NOT NULL, "finishedAt" timestamptz,
      outcome varchar(16) NOT NULL DEFAULT 'started' CHECK (outcome IN ('started','accepted','not_accepted','uncertain')),
      reason varchar(80), UNIQUE ("jobId",number)
    )`);
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of ['reminder_attempt', 'reminder_job', 'client_reminder_preference', 'reminder_settings']) {
      await q.query(`DROP TABLE ${table}`);
    }
    await q.query(`ALTER TABLE schedule_entry DROP COLUMN "reminderGeneration", DROP COLUMN "remindersDisabled"`);
  }
}
