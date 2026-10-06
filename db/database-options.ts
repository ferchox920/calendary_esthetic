import { join } from 'path';
import { DataSourceOptions } from 'typeorm';

export function createDatabaseOptions(env: NodeJS.ProcessEnv): Extract<DataSourceOptions, { type: 'postgres' }> {
  const required = (name: string): string => {
    const value = env[name];
    if (!value?.trim()) throw new Error(`Missing environment variable: ${name}`);
    return value;
  };
  const boolean = (name: string, fallback: boolean): boolean => {
    if (env[name] === undefined) return fallback;
    if (!['true', 'false'].includes(env[name])) throw new Error(`${name} must be true or false`);
    return env[name] === 'true';
  };
  const port = Number(required('POSTGRES_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('POSTGRES_PORT must be an integer between 1 and 65535');
  }
  const glob = (pattern: string) => join(__dirname, pattern).replace(/\\/g, '/');
  return {
    type: 'postgres',
    host: required('POSTGRES_HOST'),
    port,
    username: required('POSTGRES_USER'),
    password: required('POSTGRES_PASSWORD'),
    database: required('POSTGRES_DATABASE'),
    // Compatibility with the legacy misspelling.
    schema: env.POSTGRES_SCHEMA || env.POSTGRES_SHEMA || 'public',
    entities: [glob('../src/**/*.entity.{ts,js}')],
    migrations: [glob('migrations/*.{ts,js}')],
    synchronize: false,
    migrationsRun: false,
    logging: false,
    ssl: boolean('POSTGRES_SSL', true)
      ? { rejectUnauthorized: boolean('POSTGRES_SSL_REJECT_UNAUTHORIZED', true) }
      : false,
  };
}
