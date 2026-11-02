import { MigrationInterface, QueryRunner } from 'typeorm';

export class GoogleCalendarSource1791304800000 implements MigrationInterface {
  name = 'GoogleCalendarSource1791304800000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE google_connection ADD "sourceReadEnabled" boolean NOT NULL DEFAULT false`);
    await q.query(`CREATE TABLE google_calendar_source (
      "ownerId" uuid PRIMARY KEY REFERENCES google_connection("ownerId") ON DELETE CASCADE,
      "calendarId" text NOT NULL, name text NOT NULL, timezone varchar(100) NOT NULL,
      enabled boolean NOT NULL DEFAULT true, generation uuid NOT NULL DEFAULT uuid_generate_v4(),
      "syncToken" text, "pageToken" text, "snapshotId" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "fullSync" boolean NOT NULL DEFAULT true, "rangeFrom" timestamptz NOT NULL, "rangeTo" timestamptz NOT NULL,
      "lastSyncedAt" timestamptz, "lastError" varchar(80), attempts integer NOT NULL DEFAULT 0,
      "nextAttemptAt" timestamptz NOT NULL DEFAULT now(), "lockToken" uuid, "lockedUntil" timestamptz,
      CHECK ("rangeFrom" < "rangeTo")
    )`);
    await q.query(`CREATE TABLE google_import_event (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "ownerId" uuid NOT NULL REFERENCES google_connection("ownerId") ON DELETE CASCADE,
      "calendarId" text NOT NULL, "eventId" text NOT NULL, title text NOT NULL DEFAULT 'Evento de Google Calendar',
      description text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '',
      "startAt" timestamptz, "endAt" timestamptz, "allDay" boolean NOT NULL DEFAULT false,
      status varchar(12) NOT NULL CHECK (status IN ('confirmed','tentative','cancelled')),
      busy boolean NOT NULL DEFAULT true, etag text, "recurringEventId" text,
      "snapshotId" uuid NOT NULL, "projectId" uuid REFERENCES tattoo_project(id),
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("ownerId","calendarId","eventId"),
      CHECK (status='cancelled' OR ("startAt" IS NOT NULL AND "endAt" IS NOT NULL)),
      CHECK ("startAt" IS NULL OR (isfinite("startAt") AND isfinite("endAt") AND "startAt" < "endAt"))
    )`);
    await q.query(`CREATE INDEX google_import_range_idx ON google_import_event ("startAt","endAt")`);
    await q.query(`CREATE INDEX google_import_project_idx ON google_import_event ("projectId")`);
    await q.query(`CREATE VIEW google_agenda_entry AS SELECT e.id, 'google'::text AS source,
      CASE WHEN e."projectId" IS NULL THEN 'block' ELSE 'session' END AS kind,
      e."startAt",e."endAt",e."startAt" AS "occupiedStartAt",e."endAt" AS "occupiedEndAt",
      CASE WHEN e."projectId" IS NULL THEN NULL WHEN e.status='cancelled' THEN 'canceled'
        WHEN e.status='tentative' THEN 'pending' ELSE 'confirmed' END AS "sessionStatus",
      (e.status<>'cancelled' AND e.busy) AS "blockActive", (e.status<>'cancelled' AND e.busy) AS "occupiesTime",
      e."projectId",e.title AS "googleTitle",e.status AS "googleStatus",e.description,e.title AS "blockReason",e."allDay",e.version,
      p.title AS "projectTitle",c.id AS "clientId",c.name AS "clientName",
      (s."calendarId"=e."calendarId") AS "inAgenda",
      EXISTS (SELECT 1 FROM schedule_entry l WHERE l."occupiedStartAt"<e."endAt" AND e."startAt"<l."occupiedEndAt"
        AND ((l.kind='session' AND l."sessionStatus"<>'canceled') OR (l.kind='block' AND l."blockActive"))) AS "hasLocalConflict"
      FROM google_import_event e LEFT JOIN tattoo_project p ON p.id=e."projectId" LEFT JOIN client c ON c.id=p."clientId"
      LEFT JOIN google_calendar_source s ON s."ownerId"=e."ownerId" WHERE e."startAt" IS NOT NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP VIEW google_agenda_entry');
    await q.query('DROP TABLE google_import_event');
    await q.query('DROP TABLE google_calendar_source');
    await q.query('ALTER TABLE google_connection DROP COLUMN "sourceReadEnabled"');
  }
}
