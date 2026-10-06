// Local, explicitly authorized one-off confirmation. Not an automatic reminder integration.
// Suppress third-party console output: libsignal may otherwise dump private session keys.
for (const method of ['log', 'info', 'warn', 'error', 'debug']) console[method] = () => {};
require('dotenv').config({ quiet: true });
Object.assign(process.env, {
  REMINDERS_WORKER_ENABLED: 'false',
  REMINDERS_PROVIDER: 'disabled',
  GOOGLE_ENABLED: 'false',
  GOOGLE_SYNC_WORKER_ENABLED: 'false',
  EMAIL_MODE: 'disabled',
});
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID, createHash } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { AppModule } = require('../dist/src/app.module.js');
const { dataSourceOptions } = require('../dist/db/data-source.js');
const { SchedulingService } = require('../dist/src/modules/agenda/scheduling.service.js');
const { ClientsProjectsService } = require('../dist/src/modules/agenda/clients-projects.service.js');
const directory = path.resolve(__dirname, '../.local/whatsapp-probe');
const manifestPath = path.join(directory, 'session-test.json'),
  inputPath = path.join(directory, 'session-test-input.json');
const report = (value) => process.stdout.write(JSON.stringify(value) + '\n');
async function save(manifest) {
  await fs.writeFile(manifestPath + '.tmp', JSON.stringify(manifest), { mode: 0o600 });
  await fs.rename(manifestPath + '.tmp', manifestPath);
}
async function run() {
  if (dataSourceOptions.host !== '127.0.0.1' || dataSourceOptions.database !== 'calendary_esthetic_dev')
    throw Error('Local development only');
  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  await fs.unlink(inputPath);
  if (!/^\+[1-9]\d{7,14}$/.test(input.phoneE164) || typeof input.text !== 'string' || !input.text.trim())
    throw Error('Invalid input');
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    manifest = {
      taskId: randomUUID(),
      fingerprint,
      windowKey: randomUUID(),
      clientKey: randomUUID(),
      projectKey: randomUUID(),
      sessionKey: randomUUID(),
      confirmKey: randomUUID(),
      sendKey: randomUUID(),
    };
    await save(manifest);
  }
  if (manifest.fingerprint !== fingerprint) throw Error('Different test request');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const db = app.get(DataSource);
    if (db.options.host !== '127.0.0.1' || db.options.database !== 'calendary_esthetic_dev')
      throw Error('Local development only');
    if (await db.showMigrations()) throw Error('Pending migrations');
    const [owner] = await db.query('SELECT id FROM owner_account WHERE active');
    if (!owner) throw Error('Active owner required');
    const schedule = app.get(SchedulingService),
      clients = app.get(ClientsProjectsService);
    const settings = await schedule.settings();
    if (settings.timezone !== 'America/Argentina/Buenos_Aires') throw Error('Unexpected agenda timezone');
    if (!manifest.windowConfigured) {
      if (manifest.windowVersion === undefined) {
        if (settings.windows.length) throw Error('Working windows already exist; review instead of replacing');
        manifest.windowVersion = settings.version;
        await save(manifest);
      }
      await schedule.replaceWindows(owner.id, manifest.windowKey, {
        version: manifest.windowVersion,
        windows: input.windows,
      });
      manifest.windowConfigured = true;
      await save(manifest);
    }
    const client = await clients.createClient(owner.id, manifest.clientKey, {
      name: 'Gabriela',
      phone: input.phoneE164,
      shortNote: 'Cliente para prueba de confirmación de sesión por WhatsApp',
    });
    manifest.clientId = client.id;
    await save(manifest);
    const project = await clients.createProject(owner.id, manifest.projectKey, {
      clientId: client.id,
      title: 'Prueba de confirmación por WhatsApp',
    });
    manifest.projectId = project.id;
    await save(manifest);
    const created = await schedule.createSession(owner.id, manifest.sessionKey, {
      projectId: project.id,
      description: 'Sesión de prueba de confirmación por WhatsApp',
      startAt: input.startAt,
      endAt: input.endAt,
    });
    manifest.entryId = created.id;
    await save(manifest);
    const confirmed = await schedule.transition(owner.id, manifest.confirmKey, created.id, 'confirmed', {
      version: created.version,
    });
    report({
      sessionId: confirmed.id,
      status: confirmed.sessionStatus,
      startAt: confirmed.startAt,
      endAt: confirmed.endAt,
    });
    const operation = `whatsapp.test:${confirmed.id}`;
    const audit = async (m, action, data) =>
      m.query(
        `INSERT INTO audit_event ("actorId","entityType","entityId",action,"after","requestId",reason)
      VALUES ($1,'reminder',$2,$3,$4,$5,'Prueba puntual autorizada por el usuario; sin recordatorios automáticos')`,
        [owner.id, confirmed.id, action, JSON.stringify(data), manifest.taskId]
      );
    const begin = async (messageId) =>
      db.transaction(async (m) => {
        await m.query('SELECT id FROM agenda_settings WHERE id=1 FOR UPDATE');
        const [previous] = await m.query(
          'SELECT * FROM idempotency_record WHERE "ownerId"=$1 AND operation=$2 AND key=$3 FOR UPDATE',
          [owner.id, operation, manifest.sendKey]
        );
        if (previous) {
          if (previous.payloadHash !== fingerprint) throw Error('Payload changed');
          if (previous.response.state === 'processing') {
            const recovered = { ...previous.response, state: 'uncertain', reason: 'interrupted_prior_attempt' };
            await m.query('UPDATE idempotency_record SET response=$4 WHERE "ownerId"=$1 AND operation=$2 AND key=$3', [
              owner.id,
              operation,
              manifest.sendKey,
              JSON.stringify(recovered),
            ]);
            await audit(m, 'test-send-uncertain', recovered);
            return recovered;
          }
          return previous.response;
        }
        const [current] = await m.query(
          `SELECT e."sessionStatus",e."startAt",c.phone,c."archivedAt" AS "clientArchivedAt",p."archivedAt" AS "projectArchivedAt"
        FROM schedule_entry e JOIN tattoo_project p ON p.id=e."projectId" JOIN client c ON c.id=p."clientId" WHERE e.id=$1 FOR UPDATE OF e`,
          [confirmed.id]
        );
        if (
          current?.sessionStatus !== 'confirmed' ||
          current.startAt <= new Date() ||
          current.phone !== input.phoneE164 ||
          current.clientArchivedAt ||
          current.projectArchivedAt
        )
          throw Error('Appointment not eligible');
        const response = { state: 'processing', messageId, startedAt: new Date().toISOString() };
        await m.query(
          'INSERT INTO idempotency_record ("ownerId",operation,key,"payloadHash",response) VALUES ($1,$2,$3,$4,$5)',
          [owner.id, operation, manifest.sendKey, fingerprint, JSON.stringify(response)]
        );
        await audit(m, 'test-send-started', response);
        return null;
      });
    const complete = async (result) =>
      db.transaction(async (m) => {
        await m.query('SELECT id FROM agenda_settings WHERE id=1 FOR UPDATE');
        const response = { ...result, finishedAt: new Date().toISOString() };
        await m.query('UPDATE idempotency_record SET response=$4 WHERE "ownerId"=$1 AND operation=$2 AND key=$3', [
          owner.id,
          operation,
          manifest.sendKey,
          JSON.stringify(response),
        ]);
        await audit(m, `test-send-${result.state}`, response);
      });
    const { sendAuthorizedSessionTest } = await import(
      pathToFileURL(path.resolve(__dirname, 'whatsapp-probe/send-once.mjs')).href
    );
    const result = await sendAuthorizedSessionTest({ phoneE164: input.phoneE164, text: input.text, begin, complete });
    report({ sessionId: confirmed.id, whatsapp: result.state, reason: result.reason || 'previous_attempt_no_resend' });
    if (result.state !== 'accepted') process.exitCode = 1;
  } finally {
    await app.close();
  }
}
run()
  .then(() => process.exit(process.exitCode || 0))
  .catch((error) => {
    report({
      status: 'test_incomplete',
      stage: ['authentication', 'connection', 'attempt_registration', 'dispatch'].includes(error.testStage)
        ? error.testStage
        : 'agenda_or_setup',
      detail: 'No automatic retry. Inspect the appointment and persisted attempt before proceeding.',
    });
    process.exit(1);
  });
