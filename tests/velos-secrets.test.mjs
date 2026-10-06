import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadSecrets } = require('../Questera-Backend/secrets.js');

const fake = (secret) => {
  const asked = [];
  return { asked, send: async (command) => (asked.push(command.input.SecretId), { SecretString: secret }) };
};

test('settings come from the secret; the environment wins and empty values are skipped', async () => {
  const client = fake(JSON.stringify({ MONGO_URL: 'mongodb://db', JWT_SECRET: 'from-secret', EMPTY: '', PORT: 9000 }));
  const env = { JWT_SECRET: 'from-env' };
  const set = await loadSecrets({ id: 'velos/api', env, client });
  assert.equal(set, 2);
  assert.deepEqual(env, { JWT_SECRET: 'from-env', MONGO_URL: 'mongodb://db', PORT: '9000' });
  assert.deepEqual(client.asked, ['velos/api']);
});

test('without a secret id nothing is read (local development)', async () => {
  const client = fake('{}');
  assert.equal(await loadSecrets({ id: '', env: {}, client }), 0);
  assert.equal(client.asked.length, 0);
});

test('a secret that is not key/value JSON fails with a clear message', async () => {
  await assert.rejects(loadSecrets({ id: 'velos/api', env: {}, client: fake('plain text') }), /not JSON/);
});
