import { MigrationInterface, QueryRunner } from 'typeorm';

export class PrivateAgenda1791300000000 implements MigrationInterface {
  name = 'PrivateAgenda1791300000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await q.query(`CREATE TABLE agenda_settings (
      id smallint PRIMARY KEY CHECK (id = 1), timezone varchar(100) NOT NULL,
      currency varchar(3) NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
      "defaultPrepMinutes" integer NOT NULL DEFAULT 15 CHECK ("defaultPrepMinutes" BETWEEN 0 AND 240),
      "defaultCleanupMinutes" integer NOT NULL DEFAULT 15 CHECK ("defaultCleanupMinutes" BETWEEN 0 AND 240),
      version integer NOT NULL DEFAULT 1 CHECK (version > 0)
    )`);
    // No fictitious working hours in the development database: configure before booking.
    await q.query(`INSERT INTO agenda_settings (id, timezone) VALUES (1, 'America/Argentina/Buenos_Aires')`);
    await q.query(`CREATE TABLE working_window (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "agendaId" smallint NOT NULL REFERENCES agenda_settings(id),
      weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      "localStart" time NOT NULL, "localEnd" time NOT NULL CHECK ("localEnd" > "localStart"),
      "validFrom" date NOT NULL, "validTo" date,
      CHECK ("validTo" IS NULL OR "validTo" >= "validFrom")
    )`);
    await q.query(`CREATE TABLE client (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), name varchar(160) NOT NULL CHECK (length(trim(name)) > 0),
      phone varchar(60), email varchar(254), "shortNote" varchar(2000), "archivedAt" timestamptz,
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CHECK (length(trim(coalesce(phone, ''))) > 0 OR length(trim(coalesce(email, ''))) > 0)
    )`);
    await q.query(`CREATE TABLE tattoo_project (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "clientId" uuid NOT NULL REFERENCES client(id),
      title varchar(160) NOT NULL CHECK (length(trim(title)) > 0), "briefDescription" varchar(2000),
      "quoteAmount" bigint CHECK ("quoteAmount" BETWEEN 0 AND 9007199254740991),
      currency varchar(3) NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
      "quoteStatus" varchar(20) NOT NULL DEFAULT 'unevaluated' CHECK ("quoteStatus" IN ('unevaluated','estimated','agreed')),
      "archivedAt" timestamptz, version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CHECK (("quoteStatus" = 'unevaluated' AND "quoteAmount" IS NULL) OR ("quoteStatus" <> 'unevaluated' AND "quoteAmount" IS NOT NULL))
    )`);
    await q.query(`CREATE INDEX project_client_idx ON tattoo_project ("clientId")`);
    await q.query(`CREATE TABLE schedule_entry (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "agendaId" smallint NOT NULL DEFAULT 1 REFERENCES agenda_settings(id),
      kind varchar(10) NOT NULL CHECK (kind IN ('session','block')),
      "startAt" timestamptz NOT NULL, "endAt" timestamptz NOT NULL,
      "occupiedStartAt" timestamptz NOT NULL, "occupiedEndAt" timestamptz NOT NULL,
      "sessionStatus" varchar(12), "blockActive" boolean,
      "prepMinutes" integer NOT NULL CHECK ("prepMinutes" BETWEEN 0 AND 240),
      "cleanupMinutes" integer NOT NULL CHECK ("cleanupMinutes" BETWEEN 0 AND 240),
      "projectId" uuid REFERENCES tattoo_project(id), description varchar(2000), reason varchar(2000),
      "cancellationReason" varchar(2000), version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT entry_finite CHECK (isfinite("startAt") AND isfinite("endAt") AND isfinite("occupiedStartAt") AND isfinite("occupiedEndAt")),
      CONSTRAINT entry_positive CHECK ("endAt" > "startAt" AND "occupiedEndAt" > "occupiedStartAt"),
      CONSTRAINT entry_margins CHECK (
        "occupiedStartAt" = "startAt" - "prepMinutes" * interval '1 minute' AND
        "occupiedEndAt" = "endAt" + "cleanupMinutes" * interval '1 minute'),
      CONSTRAINT entry_kind_fields CHECK (
        (kind = 'session' AND "projectId" IS NOT NULL AND description IS NOT NULL AND length(trim(description)) > 0
          AND "sessionStatus" IS NOT NULL AND "sessionStatus" IN ('pending','confirmed','done','absent','canceled')
          AND "blockActive" IS NULL AND reason IS NULL
          AND ("sessionStatus" <> 'canceled' OR length(trim(coalesce("cancellationReason", ''))) > 0)) OR
        (kind = 'block' AND "projectId" IS NULL AND description IS NULL AND "sessionStatus" IS NULL
          AND "blockActive" IS NOT NULL AND "prepMinutes" = 0 AND "cleanupMinutes" = 0
          AND reason IS NOT NULL AND length(trim(reason)) > 0 AND "cancellationReason" IS NULL)),
      CONSTRAINT agenda_no_overlap EXCLUDE USING gist (
        "agendaId" WITH =, tstzrange("occupiedStartAt", "occupiedEndAt", '[)') WITH &&
      ) WHERE ((kind = 'session' AND "sessionStatus" <> 'canceled') OR (kind = 'block' AND "blockActive"))
    )`);
    await q.query(`CREATE INDEX entry_project_idx ON schedule_entry ("projectId")`);
    await q.query(`CREATE INDEX entry_start_idx ON schedule_entry ("startAt")`);
    await q.query(`CREATE TABLE audit_event (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "actorId" uuid NOT NULL REFERENCES owner_account(id),
      "entityType" varchar(40) NOT NULL, "entityId" varchar(100) NOT NULL, action varchar(40) NOT NULL,
      "occurredAt" timestamptz NOT NULL DEFAULT now(), "before" jsonb, "after" jsonb, reason varchar(2000),
      "requestId" uuid NOT NULL
    )`);
    await q.query(`CREATE INDEX audit_entity_idx ON audit_event ("entityType", "entityId", "occurredAt")`);
    await q.query(`CREATE TABLE idempotency_record (
      "ownerId" uuid NOT NULL REFERENCES owner_account(id), operation varchar(100) NOT NULL,
      key varchar(128) NOT NULL, "payloadHash" varchar(64) NOT NULL, response jsonb NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("ownerId", operation, key)
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      'idempotency_record',
      'audit_event',
      'schedule_entry',
      'tattoo_project',
      'client',
      'working_window',
      'agenda_settings',
    ]) {
      await q.query(`DROP TABLE "${table}"`);
    }
    // Extensions may be shared by other schemas; leave btree_gist installed.
  }
}
