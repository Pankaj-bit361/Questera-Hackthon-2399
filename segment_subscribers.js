import fs from 'fs';

// Read the potential subscribers
const data = fs.readFileSync('potential_subscribers.csv', 'utf8');
const lines = data.split('\n').slice(1).filter(l => l.trim());

const subscribers = lines.map(line => {
  const parts = line.split(',');
  return {
    username: parts[0],
    email: parts[1],
    name: parts[2] || '',
    category: parts[3] || '',
    followers: parseInt(parts[4]) || 0,
    score: parseInt(parts[5]) || 0
  };
});

console.log(`\n📊 Segmenting ${subscribers.length.toLocaleString()} potential subscribers...\n`);

// ============================================
// 1. FILTER BY CATEGORY
// ============================================
const categoryGroups = {
  'marketing_agencies': ['marketing agency', 'advertising agency', 'social media agency', 'consulting agency', 'public relations agency', 'advertising/marketing'],
  'photographers': ['photographer', 'photography'],
  'artists_designers': ['artist', 'graphic designer', 'designer', 'art'],
  'digital_creators': ['digital creator', 'content creator', 'blogger', 'influencer'],
  'entrepreneurs': ['entrepreneur', 'coach', 'consultant', 'public figure'],
  'fashion_beauty': ['fashion', 'beauty', 'clothing', 'fashion model', 'health/beauty', 'beauty, cosmetic'],
  'musicians': ['musician', 'musician/band', 'music'],
  'real_estate': ['real estate', 'real estate agent']
};

const categorySegments = {};
for (const [segmentName, keywords] of Object.entries(categoryGroups)) {
  categorySegments[segmentName] = subscribers.filter(s => 
    keywords.some(k => s.category.toLowerCase().includes(k))
  );
}

// ============================================
// 2. SEGMENT BY FOLLOWER TIER
// ============================================
const followerTiers = {
  'nano_500_1k': subscribers.filter(s => s.followers >= 500 && s.followers < 1000),
  'micro_1k_10k': subscribers.filter(s => s.followers >= 1000 && s.followers < 10000),
  'mid_10k_50k': subscribers.filter(s => s.followers >= 10000 && s.followers < 50000),
  'macro_50k_100k': subscribers.filter(s => s.followers >= 50000 && s.followers < 100000),
  'mega_100k_plus': subscribers.filter(s => s.followers >= 100000)
};

// ============================================
// 3. SAVE CATEGORY CSVs
// ============================================
console.log('📁 CATEGORY SEGMENTS:\n');
const header = 'username,email,name,category,followers,score';

for (const [name, subs] of Object.entries(categorySegments)) {
  if (subs.length > 0) {
    const filename = `segments/category_${name}.csv`;
    const content = header + '\n' + subs.map(s => 
      `${s.username},${s.email},${s.name},${s.category},${s.followers},${s.score}`
    ).join('\n');
    
    if (!fs.existsSync('segments')) fs.mkdirSync('segments');
    fs.writeFileSync(filename, content);
    console.log(`   ✅ ${name}: ${subs.length.toLocaleString()} users → ${filename}`);
  }
}

// ============================================
// 4. SAVE FOLLOWER TIER CSVs
// ============================================
console.log('\n📊 FOLLOWER TIER SEGMENTS:\n');

for (const [tier, subs] of Object.entries(followerTiers)) {
  if (subs.length > 0) {
    const filename = `segments/tier_${tier}.csv`;
    const content = header + '\n' + subs.map(s => 
      `${s.username},${s.email},${s.name},${s.category},${s.followers},${s.score}`
    ).join('\n');
    
    fs.writeFileSync(filename, content);
    console.log(`   ✅ ${tier}: ${subs.length.toLocaleString()} users → ${filename}`);
  }
}

// ============================================
// 5. CREATE TOP 100 FOR EACH SEGMENT
// ============================================
console.log('\n🏆 TOP 100 PER CATEGORY (highest score + followers):\n');

for (const [name, subs] of Object.entries(categorySegments)) {
  if (subs.length >= 10) {
    const top100 = subs
      .sort((a, b) => b.score - a.score || b.followers - a.followers)
      .slice(0, 100);
    
    const filename = `segments/top100_${name}.csv`;
    const content = header + '\n' + top100.map(s => 
      `${s.username},${s.email},${s.name},${s.category},${s.followers},${s.score}`
    ).join('\n');
    
    fs.writeFileSync(filename, content);
    console.log(`   ⭐ Top 100 ${name} → ${filename}`);
  }
}

// ============================================
// 6. SUMMARY STATS
// ============================================
console.log('\n' + '='.repeat(60));
console.log('📈 SEGMENT SUMMARY');
console.log('='.repeat(60));

console.log('\n🎯 By Category:');
for (const [name, subs] of Object.entries(categorySegments)) {
  const avgFollowers = Math.round(subs.reduce((sum, s) => sum + s.followers, 0) / subs.length);
  console.log(`   ${name.padEnd(20)} ${subs.length.toLocaleString().padStart(8)} users | Avg: ${avgFollowers.toLocaleString()} followers`);
}

console.log('\n👥 By Follower Tier:');
const tierLabels = {
  'nano_500_1k': 'Nano (500-1K)',
  'micro_1k_10k': 'Micro (1K-10K)',
  'mid_10k_50k': 'Mid-tier (10K-50K)',
  'macro_50k_100k': 'Macro (50K-100K)',
  'mega_100k_plus': 'Mega (100K+)'
};

for (const [tier, subs] of Object.entries(followerTiers)) {
  console.log(`   ${tierLabels[tier].padEnd(20)} ${subs.length.toLocaleString().padStart(8)} users`);
}

console.log('\n✅ All segment files saved to ./segments/ folder');

