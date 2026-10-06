/**
 * Migration: autopilots become standalone, independent of chats.
 *
 * Before: AutopilotConfig  UNIQUE {userId, chatId, platform}
 *         AutopilotMemory  UNIQUE {userId, chatId}
 * After:  AutopilotConfig  UNIQUE {userId, platform}
 *         AutopilotMemory  UNIQUE {userId}
 *
 * An autopilot is a standing thing that runs on a schedule; tying it to a chat
 * thread meant the same brand had to be reconfigured in every new chat and an
 * autopilot's lifetime was bound to a conversation.
 *
 * Where a user has several configs for the same platform across chats, the
 * richest one wins - enabled first, then most recently run, then newest. The
 * losers are archived (not deleted) so nothing is silently lost.
 *
 * Same rule for memories: the one with the most brand data and history wins.
 *
 * Safe to run more than once.
 *
 *   node scripts/migrateAutopilotStandalone.js --dry
 *   node scripts/migrateAutopilotStandalone.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const DRY = process.argv.includes('--dry');

const score = {
  // Prefer a config that is actually running, then one that has run recently.
  config: (c) => (c.enabled ? 1e12 : 0) + (c.lastRunAt ? new Date(c.lastRunAt).getTime() : 0) + (c.updatedAt ? new Date(c.updatedAt).getTime() / 1e3 : 0),
  // Prefer the memory that actually has a brand and some history.
  memory: (m) =>
    (m.brand?.topicsAllowed?.length || 0) * 1000 +
    (m.brand?.proofPoints?.length || 0) * 1000 +
    (m.contentHistory?.length || 0) * 10 +
    (m.brand?.targetAudience ? 500 : 0),
};

async function dedupe(coll, keyFn, scoreFn, label) {
  const docs = await coll.find({}).toArray();
  const groups = new Map();
  for (const d of docs) {
    const k = keyFn(d);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }

  let archived = 0;
  for (const [k, group] of groups) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => scoreFn(b) - scoreFn(a));
    const [winner, ...losers] = sorted;
    console.log(`  ${label} "${k}": ${group.length} rows -> keeping ${winner._id}`);
    for (const l of losers) {
      console.log(`     archiving ${l._id} (chatId ${l.chatId})`);
      if (!DRY) {
        await coll.updateOne(
          { _id: l._id },
          { $set: { archivedAt: new Date(), archivedReason: 'superseded by standalone autopilot migration', enabled: false } }
        );
        // Move it out of the unique keyspace without destroying it.
        await coll.updateOne({ _id: l._id }, { $set: { userId: `archived:${l.userId}:${l._id}` } });
      }
      archived += 1;
    }
  }
  return archived;
}

async function swapIndex(coll, dropNames, newKey, label) {
  const existing = await coll.indexes();
  for (const name of dropNames) {
    if (existing.some((i) => i.name === name)) {
      console.log(`  dropping ${label}.${name}`);
      if (!DRY) await coll.dropIndex(name);
    }
  }
  // An index with the same key may already exist WITHOUT the unique flag - a
  // field-level `index: true` produces exactly that, and it shares the
  // auto-generated name, so creating the unique one on top fails. Replace it.
  const sameKey = existing.find((i) => JSON.stringify(i.key) === JSON.stringify(newKey));
  if (sameKey?.unique) {
    console.log(`  ${label} unique ${JSON.stringify(newKey)} already present`);
    return;
  }
  if (sameKey) {
    console.log(`  replacing non-unique ${label}.${sameKey.name} with a unique one`);
    if (!DRY) await coll.dropIndex(sameKey.name);
  } else {
    console.log(`  creating ${label} unique ${JSON.stringify(newKey)}`);
  }
  if (!DRY) await coll.createIndex(newKey, { unique: true });
}

async function main() {
  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;
  const configs = db.collection('autopilotconfigs');
  const memories = db.collection('autopilotmemories');

  console.log(DRY ? '\n🔍 DRY RUN - nothing will be written\n' : '\n▶️  Applying migration\n');

  console.log('configs:');
  const cArchived = await dedupe(configs, (c) => `${c.userId}|${c.platform}`, score.config, 'config');
  console.log(`  ${cArchived} duplicate config(s) archived`);

  console.log('memories:');
  const mArchived = await dedupe(memories, (m) => m.userId, score.memory, 'memory');
  console.log(`  ${mArchived} duplicate memory/memories archived`);

  console.log('indexes:');
  await swapIndex(
    configs,
    ['userId_1_chatId_1_platform_1', 'userId_1_chatId_1'],
    { userId: 1, platform: 1 },
    'autopilotconfigs'
  );
  await swapIndex(memories, ['userId_1_chatId_1'], { userId: 1 }, 'autopilotmemories');

  console.log(DRY ? '\n🔍 Dry run complete.\n' : '\n✅ Migration complete.\n');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n💥 Migration failed:', err.message);
  process.exit(1);
});
