import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { createDatabaseOptions } from '../db/database-options';
import { Init_1707781446343 } from '../db/migrations/1707781446343-init_';
import { OwnerAccount1791298800000 } from '../db/migrations/1791298800000-owner-account';
import { PrivateAgenda1791300000000 } from '../db/migrations/1791300000000-private-agenda';

describe('Additive agenda migration (disposable PostgreSQL database)', () => {
  let admin: DataSource, fixture: DataSource;
  const database = `calendary_migration_test_${randomUUID().replace(/-/g, '')}`;

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
      migrations: [Init_1707781446343, OwnerAccount1791298800000, PrivateAgenda1791300000000],
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

  it('migrates an empty database and reverses only the new tables', async () => {
    expect(await fixture.runMigrations()).toHaveLength(3);
    expect((await fixture.query('SELECT timezone FROM agenda_settings'))[0].timezone).toBe(
      'America/Argentina/Buenos_Aires'
    );
    expect((await fixture.query('SELECT count(*) FROM working_window'))[0].count).toBe('0');
    await fixture.undoLastMigration();
    expect((await fixture.query(`SELECT to_regclass('schedule_entry') AS table`))[0].table).toBeNull();
    expect((await fixture.query(`SELECT to_regclass('owner_account') AS table`))[0].table).toBe('owner_account');
  });

  it('preserves existing IDs, values and relationships without inventing consultation durations', async () => {
    const [user] = await fixture.query(
      `INSERT INTO users (email,name) VALUES ('legacy-demo@example.test','Legacy Demo') RETURNING *`
    );
    const [consultation] = await fixture.query(
      `INSERT INTO consultation (status,date,"userId") VALUES ('scheduled','2035-06-11T10:00:00',$1) RETURNING *`,
      [user.id]
    );
    const [owner] = await fixture.query(
      `INSERT INTO owner_account (email,"passwordHash") VALUES ('owner-demo@example.test','fictitious-hash') RETURNING *`
    );
    expect(await fixture.runMigrations()).toHaveLength(1);
    expect((await fixture.query('SELECT * FROM users WHERE id=$1', [user.id]))[0]).toEqual(user);
    expect((await fixture.query('SELECT * FROM consultation WHERE id=$1', [consultation.id]))[0]).toEqual(consultation);
    expect((await fixture.query('SELECT * FROM owner_account WHERE id=$1', [owner.id]))[0]).toEqual(owner);
    expect((await fixture.query('SELECT count(*) FROM schedule_entry'))[0].count).toBe('0');
    expect(await fixture.showMigrations()).toBe(false);
  });
});
