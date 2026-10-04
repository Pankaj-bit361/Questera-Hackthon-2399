// Starting a worker for one Studio run, and choosing how Studio runs from the environment.
//
//   STUDIO_RUNNER=local    (default) jobs run inside the API process, files on local disk (STUDIO_DATA_DIR)
//   STUDIO_RUNNER=fargate  files in S3, every run is its own ECS Fargate task (production)
//   STUDIO_RUNNER=process  files in S3, every run is a child process here (tests the worker path without ECS)
//
// See deploy/studio/README.md for the AWS side and the full list of variables.

const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { S3Store } = require('./store.cjs');

// Fastest first; a smaller size is tried when the account is at its Fargate vCPU limit.
// Machine sizes per task, largest first (a smaller one is tried when the larger is unavailable). Rendering uses every
// core; reading a site and lining up music don't, and the account's Fargate vCPU quota is shared by every run.
const SIZES = [
  { cpu: '8192', memory: '16384' },
  { cpu: '4096', memory: '8192' },
];
const LIGHT = { capture: [{ cpu: '4096', memory: '8192' }, { cpu: '2048', memory: '4096' }], music: [{ cpu: '1024', memory: '2048' }] };
const CAPACITY = /limit|capacity|quota|RESOURCE|vCPU/i;

class FargateLauncher {
  constructor({ region, credentials, cluster, taskDefinition, subnets, securityGroups, container = 'worker' }) {
    Object.assign(this, { region, credentials, cluster, taskDefinition, subnets, securityGroups, container });
  }

  async start({ id, task, videoId, secretKey }) {
    const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
    this.ecs ||= new ECSClient({ region: this.region, credentials: this.credentials });
    const environment = [
      { name: 'STUDIO_JOB_ID', value: id },
      { name: 'STUDIO_TASK', value: task },
    ];
    if (videoId) environment.push({ name: 'STUDIO_VIDEO_ID', value: videoId });
    if (secretKey) environment.push({ name: 'STUDIO_SECRET_KEY', value: secretKey });
    let reason = '';
    for (const size of LIGHT[task] || SIZES) {
      let res;
      try {
        res = await this.ecs.send(
        new RunTaskCommand({
          cluster: this.cluster,
          taskDefinition: this.taskDefinition,
          launchType: 'FARGATE',
          count: 1,
          startedBy: `studio-${id.slice(0, 8)}`,
          networkConfiguration: { awsvpcConfiguration: { subnets: this.subnets, securityGroups: this.securityGroups, assignPublicIp: 'ENABLED' } },
          overrides: { cpu: size.cpu, memory: size.memory, containerOverrides: [{ name: this.container, environment }] },
        }),
        );
      } catch (error) {
        reason = error.message;
        if (CAPACITY.test(reason)) continue;
        throw error;
      }
      const started = res.tasks?.[0];
      if (started) return { kind: 'fargate', task: started.taskArn.split('/').pop(), cpu: Number(size.cpu) / 1024, startedAt: new Date().toISOString() };
      reason = (res.failures || []).map((f) => `${f.reason || ''} ${f.detail || ''}`.trim()).join('; ') || 'no task started';
      if (!CAPACITY.test(reason)) break;
    }
    // Out of capacity (the account's vCPU quota is in use): the caller queues the run and tries again shortly.
    throw Object.assign(new Error(`Fargate: ${reason}`), { capacity: CAPACITY.test(reason) });
  }
}

class ProcessLauncher {
  async start({ id, task, videoId, secretKey }) {
    const child = spawn(process.execPath, [path.join(__dirname, 'worker.cjs')], {
      env: { ...process.env, STUDIO_JOB_ID: id, STUDIO_TASK: task, STUDIO_VIDEO_ID: videoId || '', STUDIO_SECRET_KEY: secretKey || '' },
      stdio: 'inherit',
      detached: false,
    });
    child.on('exit', (code) => code && console.warn(`[studio] worker for ${id} exited with ${code}`));
    return { kind: 'process', pid: child.pid, startedAt: new Date().toISOString() };
  }
}

const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** The bucket, from STUDIO_BUCKET / STUDIO_AWS_REGION / STUDIO_S3_ENDPOINT and optional STUDIO_AWS_* keys. */
const credentialsFrom = (env) => (env.STUDIO_AWS_ACCESS_KEY_ID ? { accessKeyId: env.STUDIO_AWS_ACCESS_KEY_ID, secretAccessKey: env.STUDIO_AWS_SECRET_ACCESS_KEY } : undefined);
const regionFrom = (env) => env.STUDIO_AWS_REGION || env.AWS_REGION || 'us-east-2';

function storeFromEnv(env = process.env) {
  return new S3Store({ bucket: env.STUDIO_BUCKET, region: regionFrom(env), endpoint: env.STUDIO_S3_ENDPOINT || undefined, credentials: credentialsFrom(env) });
}

/** Options for createStudioRouter: { root, store?, launcher? }. Throws if a required variable is missing. */
function studioFromEnv(defaultRoot, env = process.env) {
  const runner = env.STUDIO_RUNNER || 'local';
  if (runner === 'local') return { root: env.STUDIO_DATA_DIR || defaultRoot };
  const need = ['STUDIO_BUCKET', ...(runner === 'fargate' ? ['STUDIO_ECS_CLUSTER', 'STUDIO_ECS_TASK', 'STUDIO_ECS_SUBNETS', 'STUDIO_ECS_SECURITY_GROUPS'] : [])];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Studio (${runner}) needs ${missing.join(', ')}.`);
  if (!['fargate', 'process'].includes(runner)) throw new Error(`Unknown STUDIO_RUNNER "${runner}" (local, fargate or process).`);
  const store = storeFromEnv(env);
  const launcher =
    runner === 'fargate'
      ? new FargateLauncher({
          region: regionFrom(env),
          credentials: credentialsFrom(env),
          cluster: env.STUDIO_ECS_CLUSTER,
          taskDefinition: env.STUDIO_ECS_TASK,
          subnets: list(env.STUDIO_ECS_SUBNETS),
          securityGroups: list(env.STUDIO_ECS_SECURITY_GROUPS),
        })
      : new ProcessLauncher();
  return { root: path.join(os.tmpdir(), 'velos-studio'), store, launcher };
}

module.exports = { FargateLauncher, ProcessLauncher, studioFromEnv, storeFromEnv, SIZES };
