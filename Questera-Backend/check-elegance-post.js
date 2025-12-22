require('dotenv').config();
const mongoose = require('mongoose');
const ScheduledPost = require('./models/scheduledPost');

async function check() {
  await mongoose.connect(process.env.MONGO_URL);
  console.log('Connected');
  
  const posts = await ScheduledPost.find({
    caption: { $regex: /Elegance/i }
  });
  
  for (const p of posts) {
    console.log('\n=== POST ===');
    console.log('Caption:', p.caption?.substring(0, 50));
    console.log('UserId:', p.userId);
    console.log('Instagram:', p.socialAccounts?.[0]?.accountUsername || 'not set');
    console.log('Status:', p.status);
    console.log('Engagement:', JSON.stringify(p.engagement, null, 2));
  }
  
  mongoose.disconnect();
}

check();

