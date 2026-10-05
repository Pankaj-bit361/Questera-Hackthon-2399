// Loads the API's settings from one AWS Secrets Manager secret (boot.js; deploy/velos/README.md).

/** Copies the secret's values into `env`; returns how many it set. */
async function loadSecrets({ id = process.env.VELOS_SECRET_ID, env = process.env, client } = {}) {
  if (!id) return 0;
  if (!client) {
    const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
    // A secret ARN carries its region; a bare name uses VELOS_SECRET_REGION.
    const region = id.startsWith('arn:') ? id.split(':')[3] : process.env.VELOS_SECRET_REGION || 'us-east-1';
    client = new SecretsManagerClient({ region });
  }
  const { GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
  const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: id }));
  let values;
  try {
    values = JSON.parse(SecretString || '');
  } catch {
    throw new Error(`Secret ${id} is not JSON (store it as key/value pairs)`);
  }
  let set = 0;
  for (const [name, value] of Object.entries(values)) {
    if (value === '' || value == null || env[name] !== undefined) continue;
    env[name] = String(value);
    set++;
  }
  return set;
}

module.exports = { loadSecrets };
