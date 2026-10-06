import { createDatabaseOptions } from '../../db/database-options';

describe('Database environment', () => {
  const env = {
    POSTGRES_HOST: '127.0.0.1', POSTGRES_PORT: '5546',
    POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'fake-test-password',
    POSTGRES_DATABASE: 'test', POSTGRES_SSL: 'false',
  };

  it('disables SSL locally and never mutates schema automatically', () => {
    const options = createDatabaseOptions(env);
    expect(options.ssl).toBe(false);
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });

  it('verifies remote certificates by default', () => {
    expect(createDatabaseOptions({ ...env, POSTGRES_SSL: undefined }).ssl)
      .toEqual({ rejectUnauthorized: true });
  });

  it.each(['0', '65536', '5546x', '1.5', ''])('rejects invalid port %s', (port) => {
    expect(() => createDatabaseOptions({ ...env, POSTGRES_PORT: port })).toThrow();
  });

  it('rejects missing credentials and invalid SSL settings without exposing secrets', () => {
    expect(() => createDatabaseOptions({ ...env, POSTGRES_PASSWORD: '' }))
      .toThrow('Missing environment variable: POSTGRES_PASSWORD');
    expect(() => createDatabaseOptions({ ...env, POSTGRES_SSL: 'yes' }))
      .toThrow('POSTGRES_SSL must be true or false');
  });

  it('accepts the legacy schema variable', () => {
    expect(createDatabaseOptions({ ...env, POSTGRES_SHEMA: 'legacy' }).schema).toBe('legacy');
    expect(createDatabaseOptions({ ...env, POSTGRES_SHEMA: 'legacy', POSTGRES_SCHEMA: 'public' }).schema)
      .toBe('public');
  });
});
