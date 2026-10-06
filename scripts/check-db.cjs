const assert = require('node:assert/strict');
const dataSource = require('../dist/db/data-source.js').default;

async function check() {
  assert.equal(dataSource.isInitialized, false, 'Import must not open a connection');
  // This command writes a rolled-back fixture exclusively in the local sandbox.
  assert.equal(dataSource.options.host, '127.0.0.1');
  assert.equal(dataSource.options.database, 'calendary_esthetic_dev');
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  try {
    const [identity] = await runner.query('SELECT current_database() AS database');
    assert.equal(identity.database, 'calendary_esthetic_dev');
    const migrations = await runner.query('SELECT name FROM public.migrations ORDER BY id');
    assert(migrations.some(row => row.name === 'Init_1707781446343'));
    assert.equal(await dataSource.showMigrations(), false, 'There are pending migrations');
    await runner.startTransaction();
    const [fixture] = await runner.query(
      'INSERT INTO public.profession (name, description) VALUES ($1, $2) RETURNING id',
      ['Demo entorno local', 'Ficticio; rollback inmediato'],
    );
    const [inside] = await runner.query('SELECT count(*)::int AS count FROM public.profession WHERE id = $1', [fixture.id]);
    assert.equal(inside.count, 1);
    await runner.rollbackTransaction();
    const [outside] = await runner.query('SELECT count(*)::int AS count FROM public.profession WHERE id = $1', [fixture.id]);
    assert.equal(outside.count, 0);
    console.log('DB OK: local identity, migrations, write/read and rollback verified. No fixture retained.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await dataSource.destroy();
  }
}

check().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
