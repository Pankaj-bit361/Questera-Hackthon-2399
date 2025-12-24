import fs from 'fs';
import readline from 'readline';

// Target categories for Velos (AI image/video generation + Instagram scheduling)
const HIGH_VALUE_CATEGORIES = [
  'content creator', 'creator', 'digital creator',
  'photographer', 'artist', 'graphic designer', 'designer',
  'influencer', 'blogger', 'vlogger',
  'marketing', 'social media', 'brand', 'agency',
  'entrepreneur', 'business', 'coach', 'consultant',
  'fashion', 'beauty', 'lifestyle', 'fitness',
  'real estate', 'e-commerce', 'product', 'shop',
  'personal brand', 'public figure', 'musician', 'video creator'
];

// Keywords in bio that indicate need for content creation tools
const BIO_KEYWORDS = [
  'content', 'creator', 'social media', 'marketing', 'brand',
  'influencer', 'photography', 'video', 'digital', 'creative',
  'design', 'visual', 'media', 'agency', 'studio',
  'freelance', 'entrepreneur', 'coach', 'consultant',
  'dm for', 'collab', 'business inquiries', 'booking',
  'portfolio', 'art', 'fashion', 'lifestyle', 'fitness'
];

async function analyzeCSV() {
  const fileStream = fs.createReadStream('0.csv');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let totalRows = 0;
  let potentialSubscribers = [];
  let categoryStats = {};
  let isHeader = true;

  console.log('🔍 Analyzing CSV file for potential Velos subscribers...\n');

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    totalRows++;

    // Parse CSV (handle commas in fields)
    const fields = parseCSVLine(line);
    if (fields.length < 9) continue;

    const [username, name, bio, category, followerCount, followingCount, website, email, phone] = fields;
    const followers = parseInt(followerCount) || 0;

    // Track category stats
    if (category) {
      categoryStats[category.toLowerCase()] = (categoryStats[category.toLowerCase()] || 0) + 1;
    }

    // Score the user
    let score = 0;
    let reasons = [];

    // 1. Category match (high value categories)
    const categoryLower = (category || '').toLowerCase();
    if (HIGH_VALUE_CATEGORIES.some(c => categoryLower.includes(c))) {
      score += 3;
      reasons.push(`Category: ${category}`);
    }

    // 2. Bio keywords
    const bioLower = (bio || '').toLowerCase();
    const matchedKeywords = BIO_KEYWORDS.filter(k => bioLower.includes(k));
    if (matchedKeywords.length >= 2) {
      score += 2;
      reasons.push(`Bio keywords: ${matchedKeywords.slice(0, 3).join(', ')}`);
    }

    // 3. Has email (contactable)
    if (email && email.includes('@')) {
      score += 2;
      reasons.push('Has email');
    }

    // 4. Has website (serious about presence)
    if (website && website.startsWith('http')) {
      score += 1;
      reasons.push('Has website');
    }

    // 5. Follower count sweet spot (1K - 500K = content creators who need tools)
    if (followers >= 1000 && followers <= 500000) {
      score += 2;
      reasons.push(`Followers: ${followers.toLocaleString()}`);
    } else if (followers >= 500 && followers < 1000) {
      score += 1;
      reasons.push(`Growing: ${followers} followers`);
    }

    // Minimum score to be considered a potential subscriber
    if (score >= 5 && email && email.includes('@')) {
      potentialSubscribers.push({
        username, name, category, followers, email, website,
        score, reasons: reasons.join(' | '),
        bio: (bio || '').substring(0, 100)
      });
    }
  }

  // Sort by score
  potentialSubscribers.sort((a, b) => b.score - a.score);

  // Output results
  console.log(`📊 Analysis Complete!\n`);
  console.log(`Total users analyzed: ${totalRows.toLocaleString()}`);
  console.log(`Potential subscribers found: ${potentialSubscribers.length.toLocaleString()}\n`);

  // Top categories
  const sortedCategories = Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log('📁 Top Categories in Dataset:');
  sortedCategories.forEach(([cat, count]) => console.log(`   ${cat}: ${count.toLocaleString()}`));

  console.log('\n🎯 Top 100 Potential Subscribers:\n');
  potentialSubscribers.slice(0, 100).forEach((u, i) => {
    console.log(`${i + 1}. @${u.username} (Score: ${u.score})`);
    console.log(`   ${u.name} | ${u.category} | ${u.followers.toLocaleString()} followers`);
    console.log(`   📧 ${u.email}`);
    console.log(`   💡 ${u.reasons}\n`);
  });

  // Save full list to file
  const outputData = potentialSubscribers.map(u =>
    `${u.username},${u.email},${u.name?.replace(/,/g, '')},${u.category},${u.followers},${u.score}`
  ).join('\n');

  fs.writeFileSync('potential_subscribers.csv',
    'username,email,name,category,followers,score\n' + outputData
  );
  console.log(`\n✅ Full list saved to: potential_subscribers.csv (${potentialSubscribers.length} users)`);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}

analyzeCSV().catch(console.error);

