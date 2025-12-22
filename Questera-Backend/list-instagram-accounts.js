/**
 * List all Instagram accounts in the database
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function listAccounts() {
  try {
    console.log('\n📱 LISTING ALL INSTAGRAM ACCOUNTS\n');
    console.log('━'.repeat(60));

    const mongoUri = process.env.MONGO_URL || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const Instagram = require('./models/instagram');
    const User = require('./models/user');

    // Get all Instagram accounts
    const accounts = await Instagram.find({});
    
    console.log(`Found ${accounts.length} Instagram account(s):\n`);

    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i];
      const user = await User.findOne({ userId: acc.userId });
      
      console.log(`${i + 1}. @${acc.instagramUsername || 'unknown'}`);
      console.log(`   👤 User: ${user?.name || 'Unknown'} (${user?.email || 'no email'})`);
      console.log(`   🆔 User ID: ${acc.userId}`);
      console.log(`   🔗 Business ID: ${acc.instagramBusinessAccountId}`);
      console.log(`   📄 Facebook Page: ${acc.facebookPageName || 'N/A'}`);
      console.log(`   ✅ Connected: ${acc.isConnected ? 'Yes' : 'No'}`);
      console.log(`   🔑 Has Token: ${acc.accessToken ? 'Yes' : 'No'}`);
      console.log('');
    }

    await mongoose.disconnect();
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
  }
}

listAccounts();

