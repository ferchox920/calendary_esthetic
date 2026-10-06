require('dotenv').config({ quiet: true });
if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DATABASE !== 'calendary_esthetic_dev') {
  throw new Error('E2E tests must originate from the isolated local development environment');
}
process.env.POSTGRES_DATABASE = 'calendary_esthetic_test';
process.env.POSTGRES_SSL = 'false';
process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
process.env.JWT_SECRET = 'isolated-e2e-fictitious-secret-at-least-32-bytes';
process.env.JWT_EXPIRATION_TIME = '1h';
process.env.EMAIL_MODE = 'disabled';
