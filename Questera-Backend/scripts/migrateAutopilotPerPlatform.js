/**
 * Migration: allow one autopilot per platform per chat.
 *
 * Before: autopilotconfigs had a UNIQUE index on {userId, chatId}, so a chat
 * could hold exactly one autopilot. Choosing a platform replaced it.
 * After:  UNIQUE on {userId, chatId, platform}, so Instagram, LinkedIn and X
 * can run side by side off the same chat and the same brand profile.
 *
 * Mongoose creates the new index on model init but never drops the old one, so
 * without this the second config for a chat fails with E11000.
 *
 * Also backfills `platform` on any config missing it, and stamps existing
 * contentHistory entries as 'instagram' (the only platform that ran before).
 *
 * Safe to run more than once.
 *
 *   node scripts/migrateAutopilotPerPlatform.js          # apply
 *   node scripts/migrateAutopilotPerPlatform.js --dry    # report only
 */

require('dotenv').config();
const mongoose = require('mongoose');

const DRY = process.argv.includes('--dry');
const OLD_INDEX = 'userId_1_chatId_1';
const NEW_KEY = { userId: 1, chatId: 1, platform: 1 };

async function main() {
  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;
  const configs = db.collection('autopilotconfigs');
  const memories = db.collection('autopilotmemories');

  console.log(DRY ? '\n🔍 DRY RUN - nothing will be written\n' : '\n▶️  Applying migration\n');

  // 1. Backfill platform before touching indexes - a null platform would
  //    collide under the new unique key.
  const missing = await configs.countDocuments({ platform: { $in: [null, ''] } });
  console.log(`configs missing platform: ${missing}`);
  if (missing && !DRY) {
    const r = await configs.updateMany(
      { platform: { $in: [null, ''] } },
      { $set: { platform: 'instagram' } }
    );
    console.log(`  backfilled ${r.modifiedCount} to 'instagram'`);
  }

  // 2. Check for rows that would violate the new key before creating it.
  const dupes = await configs.aggregate([
    { $group: { _id: { userId: '$userId', chatId: '$chatId', platform: '$platform' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  if (dupes.length) {
    console.error(`\n❌ ${dupes.length} duplicate (userId, chatId, platform) group(s) found.`);
    dupes.forEach((d) => console.error('   ', JSON.stringify(d._id), '->', d.n, 'docs'));
    console.error('   Resolve these before migrating; refusing to continue.\n');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('no duplicate (userId, chatId, platform) groups - safe to reindex');

  // 3. Swap the index.
  const existing = await configs.indexes();
  const hasOld = existing.some((i) => i.name === OLD_INDEX);
  const hasNew = existing.some((i) => JSON.stringify(i.key) === JSON.stringify(NEW_KEY));
  console.log(`old index ${OLD_INDEX}: ${hasOld ? 'present' : 'absent'}`);
  console.log(`new index {userId,chatId,platform}: ${hasNew ? 'present' : 'absent'}`);

  if (!DRY) {
    if (!hasNew) {
      await configs.createIndex(NEW_KEY, { unique: true });
      console.log('  created new unique index');
    }
    if (hasOld) {
      await configs.dropIndex(OLD_INDEX);
      console.log(`  dropped ${OLD_INDEX}`);
    }
  }

  // 4. Stamp existing history entries. Everything that ran before this change
  //    was Instagram, so anything unlabelled is Instagram.
  const unstamped = await memories.countDocuments({ 'contentHistory.platform': { $exists: false }, 'contentHistory.0': { $exists: true } });
  console.log(`memories with unstamped contentHistory: ${unstamped}`);
  if (unstamped && !DRY) {
    const r = await memories.updateMany(
      { 'contentHistory.0': { $exists: true } },
      { $set: { 'contentHistory.$[e].platform': 'instagram' } },
      { arrayFilters: [{ 'e.platform': { $exists: false } }] }
    );
    console.log(`  stamped ${r.modifiedCount} memory doc(s)`);
  }

  // Memory stays unique on {userId, chatId} - the brand profile is shared
  // across a chat's autopilots by design, so that index is still correct.

  console.log(DRY ? '\n🔍 Dry run complete.\n' : '\n✅ Migration complete.\n');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n💥 Migration failed:', err.message);
  process.exit(1);
});
