const dataSource = require('../dist/db/data-source.js').default;
const { manageOwner } = require('../dist/src/modules/auth/owner-management.js');

async function run() {
  const mode = process.argv[2];
  if (!['init', 'reset'].includes(mode)) throw new Error('Use owner:init or owner:reset');
  await dataSource.initialize();
  try {
    await manageOwner(dataSource, mode, process.env.OWNER_EMAIL, process.env.OWNER_PASSWORD);
    console.log(
      mode === 'init'
        ? 'Owner provisioned. Credentials were not logged.'
        : 'Owner recovered. All previous sessions revoked.'
    );
  } finally {
    await dataSource.destroy();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
