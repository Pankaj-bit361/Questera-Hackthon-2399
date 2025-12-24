import fs from 'fs';

const BATCH_SIZE = 50000; // AWS SES limit
const OUTPUT_DIR = 'daily_campaigns_50k';

// Read all subscribers
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

console.log(`\n📊 Creating Daily Campaign Batches`);
console.log(`${'='.repeat(50)}`);
console.log(`Total users: ${subscribers.length.toLocaleString()}`);
console.log(`Batch size: ${BATCH_SIZE.toLocaleString()} users/day`);
console.log(`Total days needed: ${Math.ceil(subscribers.length / BATCH_SIZE)}\n`);

// Sort by priority: score DESC, then followers DESC
subscribers.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  return b.followers - a.followers;
});

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// Split into daily batches
const batches = [];
for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
  batches.push(subscribers.slice(i, i + BATCH_SIZE));
}

const header = 'username,email,name,category,followers,score';
const campaignSchedule = [];

// Generate start date (today)
const startDate = new Date();

batches.forEach((batch, index) => {
  const dayNum = index + 1;
  const campaignDate = new Date(startDate);
  campaignDate.setDate(startDate.getDate() + index);
  const dateStr = campaignDate.toISOString().split('T')[0];

  const filename = `${OUTPUT_DIR}/day_${String(dayNum).padStart(2, '0')}_${dateStr}.csv`;

  // Calculate batch stats
  const avgScore = (batch.reduce((sum, s) => sum + s.score, 0) / batch.length).toFixed(1);
  const avgFollowers = Math.round(batch.reduce((sum, s) => sum + s.followers, 0) / batch.length);
  const topCategories = getTopCategories(batch, 3);

  // Save batch file
  const content = header + '\n' + batch.map(s =>
    `${s.username},${s.email},${s.name},${s.category},${s.followers},${s.score}`
  ).join('\n');
  fs.writeFileSync(filename, content);

  campaignSchedule.push({
    day: dayNum,
    date: dateStr,
    file: filename,
    count: batch.length,
    avgScore,
    avgFollowers,
    topCategories,
    priority: dayNum <= 3 ? '🔥 HIGH' : dayNum <= 7 ? '⚡ MEDIUM' : '📧 STANDARD'
  });

  console.log(`📅 Day ${dayNum} (${dateStr}): ${batch.length.toLocaleString()} users → ${filename}`);
});

// Create campaign schedule markdown
const scheduleContent = `# 📅 Velos 10-Day Email Campaign Schedule

## Overview
- **Total Users:** ${subscribers.length.toLocaleString()}
- **Daily Target:** ${BATCH_SIZE.toLocaleString()} users
- **Campaign Duration:** ${batches.length} days
- **Start Date:** ${startDate.toISOString().split('T')[0]}

## Daily Breakdown

| Day | Date | Users | Priority | Avg Score | Avg Followers | Top Categories |
|-----|------|-------|----------|-----------|---------------|----------------|
${campaignSchedule.map(c =>
  `| ${c.day} | ${c.date} | ${c.count.toLocaleString()} | ${c.priority} | ${c.avgScore} | ${c.avgFollowers.toLocaleString()} | ${c.topCategories} |`
).join('\n')}

## Priority Explanation

- **🔥 HIGH (Days 1-3):** Best leads - highest scores, most engaged
- **⚡ MEDIUM (Days 4-7):** Strong leads - good conversion potential  
- **📧 STANDARD (Days 8+):** Quality leads - consistent outreach

## Daily Campaign Files

${campaignSchedule.map(c => `- \`${c.file}\` - Day ${c.day} (${c.date})`).join('\n')}

## Recommended Send Times

| Region | Best Time |
|--------|-----------|
| US East | 9:00 AM - 11:00 AM EST |
| US West | 9:00 AM - 11:00 AM PST |
| Europe | 10:00 AM - 12:00 PM CET |
| Asia | 10:00 AM - 12:00 PM local |

## Email Sequence Per Batch

1. **Day 0:** Initial outreach email
2. **Day 3:** Follow-up for non-openers
3. **Day 7:** Final follow-up with offer

## Tracking Checklist

- [ ] Day 1 sent
- [ ] Day 2 sent
- [ ] Day 3 sent
- [ ] Day 4 sent
- [ ] Day 5 sent
- [ ] Day 6 sent
- [ ] Day 7 sent
- [ ] Day 8 sent
- [ ] Day 9 sent
- [ ] Day 10 sent
- [ ] Day 11 sent
`;

fs.writeFileSync(`${OUTPUT_DIR}/CAMPAIGN_SCHEDULE.md`, scheduleContent);

console.log(`\n${'='.repeat(50)}`);
console.log(`✅ Campaign Created Successfully!`);
console.log(`${'='.repeat(50)}`);
console.log(`\n📁 Output folder: ./${OUTPUT_DIR}/`);
console.log(`📋 Schedule: ${OUTPUT_DIR}/CAMPAIGN_SCHEDULE.md`);
console.log(`📧 ${batches.length} daily batch files created\n`);

function getTopCategories(batch, n) {
  const cats = {};
  batch.forEach(s => {
    const cat = s.category.toLowerCase();
    cats[cat] = (cats[cat] || 0) + 1;
  });
  return Object.entries(cats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([c]) => c.split(' ')[0])
    .join(', ');
}

