import { MigrationInterface, QueryRunner } from 'typeorm';

export class GoogleIntegration1791301200000 implements MigrationInterface {
  name = 'GoogleIntegration1791301200000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE google_connection (
      "ownerId" uuid PRIMARY KEY REFERENCES owner_account(id) ON DELETE CASCADE,
      subject varchar(255) NOT NULL UNIQUE, email varchar(254) NOT NULL,
      "loginEnabled" boolean NOT NULL DEFAULT true, "calendarEnabled" boolean NOT NULL DEFAULT false,
      "refreshTokenEncrypted" text, "calendarId" text,
      generation uuid NOT NULL DEFAULT uuid_generate_v4(), "needsReconnect" boolean NOT NULL DEFAULT false,
      "provisionAttempts" integer NOT NULL DEFAULT 0 CHECK ("provisionAttempts">=0), "lastError" varchar(80),
      "provisionToken" uuid, "provisionUntil" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CHECK (NOT "calendarEnabled" OR "refreshTokenEncrypted" IS NOT NULL)
    )`);
    await q.query(`CREATE TABLE google_oauth_state (
      "stateHash" varchar(64) PRIMARY KEY, purpose varchar(10) NOT NULL CHECK (purpose IN ('login','connect')),
      "ownerId" uuid REFERENCES owner_account(id) ON DELETE CASCADE, "sessionVersion" integer,
      "nonceHash" varchar(64) NOT NULL, "verifierEncrypted" text NOT NULL,
      "expiresAt" timestamptz NOT NULL,
      CHECK ((purpose='login' AND "ownerId" IS NULL AND "sessionVersion" IS NULL) OR
        (purpose='connect' AND "ownerId" IS NOT NULL AND "sessionVersion" IS NOT NULL AND "sessionVersion">0))
    )`);
    await q.query(`CREATE INDEX google_state_expiry_idx ON google_oauth_state ("expiresAt")`);
    await q.query(`CREATE TABLE google_sync_job (
      "entryId" uuid PRIMARY KEY REFERENCES schedule_entry(id) ON DELETE CASCADE,
      "ownerId" uuid NOT NULL REFERENCES google_connection("ownerId") ON DELETE CASCADE,
      revision bigint NOT NULL DEFAULT 1 CHECK (revision>0), attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
      "nextAttemptAt" timestamptz NOT NULL DEFAULT now(), "lockedUntil" timestamptz,
      "lockToken" uuid, "lastError" varchar(80), "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX google_job_due_idx ON google_sync_job ("nextAttemptAt")`);
    await q.query(`CREATE TABLE google_event_mapping (
      "entryId" uuid PRIMARY KEY REFERENCES schedule_entry(id) ON DELETE CASCADE,
      "ownerId" uuid NOT NULL REFERENCES google_connection("ownerId") ON DELETE CASCADE,
      "calendarId" text NOT NULL, "eventId" varchar(100) NOT NULL, "entryVersion" integer NOT NULL,
      "syncedAt" timestamptz NOT NULL DEFAULT now()
    )`);
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of ['google_event_mapping', 'google_sync_job', 'google_oauth_state', 'google_connection']) {
      await q.query(`DROP TABLE "${table}"`);
    }
  }
}
