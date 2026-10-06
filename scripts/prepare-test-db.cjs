require('dotenv').config({ quiet: true });
const { Client } = require('pg');

async function prepare() {
  if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DATABASE !== 'calendary_esthetic_dev') {
    throw new Error('Integration tests require the isolated local development cluster');
  }
  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
    ssl: false,
  });
  await client.connect();
  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['calendary_esthetic_test']);
    if (!result.rowCount) await client.query('CREATE DATABASE calendary_esthetic_test');
    console.log('Isolated integration database ready: calendary_esthetic_test');
  } finally {
    await client.end();
  }
}

prepare().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
