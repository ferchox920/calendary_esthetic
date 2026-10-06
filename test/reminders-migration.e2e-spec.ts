import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { createDatabaseOptions } from '../db/database-options';
import { Init_1707781446343 } from '../db/migrations/1707781446343-init_';
import { OwnerAccount1791298800000 } from '../db/migrations/1791298800000-owner-account';
import { PrivateAgenda1791300000000 } from '../db/migrations/1791300000000-private-agenda';
import { GoogleIntegration1791301200000 } from '../db/migrations/1791301200000-google-integration';
import { Reminders1791302400000 } from '../db/migrations/1791302400000-reminders';

describe('Reminder migration (disposable PostgreSQL database)', () => {
  let admin: DataSource, fixture: DataSource;
  const database = `calendary_reminders_test_${randomUUID().replace(/-/g, '')}`;
  beforeAll(async () => {
    const options = createDatabaseOptions(process.env);
    expect(options.host).toBe('127.0.0.1');
    expect(options.database).toBe('calendary_esthetic_test');
    admin = await new DataSource({ ...options, entities: [], migrations: [] }).initialize();
    await admin.query(`CREATE DATABASE "${database}"`);
    fixture = await new DataSource({
      ...options,
      database,
      entities: [],
      migrations: [
        Init_1707781446343,
        OwnerAccount1791298800000,
        PrivateAgenda1791300000000,
        GoogleIntegration1791301200000,
        Reminders1791302400000,
      ],
    }).initialize();
    await fixture.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  });
  afterAll(async () => {
    if (fixture?.isInitialized) await fixture.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
      await admin.destroy();
    }
  });
  it('installs from zero, defaults to disabled and reverses only reminder structures', async () => {
    expect(await fixture.runMigrations()).toHaveLength(5);
    expect((await fixture.query('SELECT enabled,version FROM reminder_settings'))[0]).toEqual({
      enabled: false,
      version: 1,
    });
    await fixture.undoLastMigration();
    expect((await fixture.query(`SELECT to_regclass('reminder_job') AS table`))[0].table).toBeNull();
    expect((await fixture.query(`SELECT to_regclass('google_sync_job') AS table`))[0].table).toBe('google_sync_job');
    expect(
      (
        await fixture.query(`SELECT count(*) FROM information_schema.columns WHERE table_name='schedule_entry'
      AND column_name IN ('remindersDisabled','reminderGeneration')`)
      )[0].count
    ).toBe('0');
  });
  it('preserves clients, sessions and Google jobs in an existing schema and enforces reminder checks', async () => {
    const [client] = await fixture.query(
      `INSERT INTO client (name,phone) VALUES ('Fictitious migration client','legacy-text') RETURNING *`
    );
    const [project] = await fixture.query(
      `INSERT INTO tattoo_project ("clientId",title) VALUES ($1,'Fictitious migration project') RETURNING *`,
      [client.id]
    );
    const [entry] = await fixture.query(
      `INSERT INTO schedule_entry
      (kind,"projectId",description,"startAt","endAt","occupiedStartAt","occupiedEndAt","prepMinutes","cleanupMinutes","sessionStatus")
      VALUES ('session',$1,'Demo','2035-06-11T13:00Z','2035-06-11T14:00Z','2035-06-11T13:00Z','2035-06-11T14:00Z',0,0,'confirmed') RETURNING *`,
      [project.id]
    );
    expect(await fixture.runMigrations()).toHaveLength(1);
    expect((await fixture.query('SELECT * FROM client WHERE id=$1', [client.id]))[0]).toEqual(client);
    expect((await fixture.query('SELECT * FROM schedule_entry WHERE id=$1', [entry.id]))[0]).toEqual({
      ...entry,
      remindersDisabled: false,
      reminderGeneration: 1,
    });
    await expect(
      fixture.query(`INSERT INTO client_reminder_preference ("clientId",enabled) VALUES ($1,true)`, [client.id])
    ).rejects.toThrow();
    await expect(
      fixture.query(`INSERT INTO client_reminder_preference ("clientId","phoneE164") VALUES ($1,'011000')`, [client.id])
    ).rejects.toThrow();
    await expect(fixture.query(`UPDATE reminder_settings SET "allowedEnd"='08:00'`)).rejects.toThrow();
    const values = [entry.id, new Date('2035-06-10T13:00Z')];
    const sql = `INSERT INTO reminder_job ("entryId",generation,"leadMinutes","settingsVersion","preferenceVersion",timezone,
      "scheduledAt","expiresAt","nextAttemptAt") VALUES ($1,1,1440,1,1,'America/Argentina/Buenos_Aires',$2,$2,$2)`;
    await fixture.query(sql, values);
    await expect(fixture.query(sql, values)).rejects.toThrow();
    expect(await fixture.showMigrations()).toBe(false);
  });
});
