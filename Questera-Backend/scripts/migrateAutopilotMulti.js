/**
 * Give every existing autopilot owner an Autopilot document and stamp its
 * autopilotId onto their memory, configs and tasks. Idempotent.
 *   node scripts/migrateAutopilotMulti.js [--dry]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const DRY = process.argv.includes('--dry');

async function swapIndexes(coll, drop, create) {
  const existing = await coll.indexes();
  for (const name of drop) if (existing.some((i) => i.name === name)) { console.log(`  drop ${coll.collectionName}.${name}`); if (!DRY) await coll.dropIndex(name); }
  const after = await coll.indexes();
  for (const [key, opts] of create) {
    const same = after.find((i) => JSON.stringify(i.key) === JSON.stringify(key));
    if (same && !!same.unique === !!opts.unique) continue;
    if (same) { console.log(`  replace ${coll.collectionName}.${same.name}`); if (!DRY) await coll.dropIndex(same.name); }
    console.log(`  create ${coll.collectionName} ${JSON.stringify(key)} ${JSON.stringify(opts)}`);
    if (!DRY) await coll.createIndex(key, opts);
  }
}

(async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const Autopilot = require('../models/autopilot');
  const Memory = require('../models/autopilotMemory');
  const Config = require('../models/autopilotConfig');
  const Task = require('../models/autopilotTask');

  const users = new Set();
  for (const M of [Memory, Config, Task]) {
    for (const u of await M.distinct('userId', { autopilotId: null })) if (!String(u).startsWith('archived:')) users.add(u);
  }
  console.log(`${users.size} user(s) with un-scoped autopilot data`);

  for (const userId of users) {
    let ap = await Autopilot.findOne({ userId, archived: false }).sort({ createdAt: 1 });
    const mem = await Memory.findOne({ userId, autopilotId: null });
    if (!ap) {
      const name = mem?.brand?.companyName || 'My autopilot';
      console.log(`  ${userId}: creating "${name}"`);
      if (DRY) continue;
      ap = await Autopilot.create({ userId, name, websiteUrl: mem?.website?.url || '' });
    }
    if (DRY) continue;
    const r = await Promise.all([
      Memory.updateOne({ userId, autopilotId: null }, { $set: { autopilotId: ap.autopilotId } }),
      Config.updateMany({ userId, autopilotId: null }, { $set: { autopilotId: ap.autopilotId } }),
      Task.updateMany({ userId, autopilotId: null }, { $set: { autopilotId: ap.autopilotId } }),
    ]);
    console.log(`  ${userId} -> ${ap.autopilotId}: memory ${r[0].modifiedCount}, configs ${r[1].modifiedCount}, tasks ${r[2].modifiedCount}`);
  }

  console.log('indexes');
  const partial = { partialFilterExpression: { autopilotId: { $type: 'string' } } };
  await swapIndexes(Memory.collection, ['userId_1'], [[{ userId: 1 }, {}], [{ autopilotId: 1 }, { unique: true, ...partial }]]);
  await swapIndexes(Config.collection, ['userId_1_platform_1'], [[{ userId: 1, platform: 1 }, {}], [{ autopilotId: 1, platform: 1 }, { unique: true, ...partial }]]);
  await swapIndexes(Task.collection, [], [[{ autopilotId: 1 }, {}]]);
  console.log(DRY ? 'dry run - nothing written' : 'done');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
