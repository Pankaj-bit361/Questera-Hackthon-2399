require('dotenv').config();
const express = require('express');
const cors = require('cors');
const imageRouter = require('./routes/Image');
const authRouter = require('./routes/Auth');
const templateRouter = require('./routes/Template');
const draftTemplateRouter = require('./routes/DraftTemplate');
const instagramRouter = require('./routes/Instagram');
const chatRouter = require('./routes/Chat');
const creditsRouter = require('./routes/Credits');
const schedulerRouter = require('./routes/Scheduler');
const campaignRouter = require('./routes/Campaign');
const liveGenRouter = require('./routes/LiveGeneration');
const analyticsRouter = require('./routes/Analytics');
const viralRouter = require('./routes/ViralContent');
const agentRouter = require('./routes/Agent');
const autopilotRouter = require('./routes/Autopilot');
const videoRouter = require('./routes/Video');
const emailCampaignRouter = require('./routes/EmailCampaign');
const emailRouter = require('./routes/Email');
const geminiDirectRouter = require('./routes/GeminiDirect');
const geminiAgentRouter = require('./routes/GeminiAgent');
const authMiddleware = require('./middlewares/auth');
const connectDB = require('./db');
const SchedulerController = require('./functions/Scheduler');
const LiveGenerationService = require('./functions/LiveGenerationService');
const AutopilotService = require('./functions/AutopilotService');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// Increase timeout for long-running requests (image generation can take 60+ seconds)
app.use((req, res, next) => {
    req.setTimeout(480000); // 8 minutes
    res.setTimeout(480000); // 8 minutes
    next();
});


// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Server is working!' });
});

// Public routes
app.use('/api/auth', authRouter);
app.use('/api/email', emailRouter); // Universal Email Service (Public)

// Protected routes
app.use('/api/image', imageRouter);
app.use('/api/template', templateRouter);
app.use('/api/draft-template', draftTemplateRouter); // Draft Template Management
app.use('/api/instagram', instagramRouter);
app.use('/api/chat', chatRouter); // Smart AI Chat & Image Generation
app.use('/api/credits', creditsRouter); // Credits & Subscription Management
app.use('/api/scheduler', schedulerRouter); // Post Scheduling
app.use('/api/campaigns', campaignRouter); // Campaign Automation
app.use('/api/live-generation', liveGenRouter); // Live Generation + Auto-Post
app.use('/api/analytics', analyticsRouter); // Analytics Dashboard
app.use('/api/viral', viralRouter); // Viral Content Extraction
app.use('/api/agent', agentRouter); // AI Agent
app.use('/api/autopilot', autopilotRouter); // Autopilot System
app.use('/api/video', videoRouter); // Video Generation
app.use('/api/email-campaign', emailCampaignRouter); // Email Campaign Dashboard
app.use('/api/gemini', geminiDirectRouter); // Direct Gemini API (no agent)
app.use('/api/gemini', geminiAgentRouter);  // Gemini Agent (tool-calling router)

// Database connection and Server Start
const startServer = async () => {
    try {
        // Connect to DB before starting server to prevent buffering timeouts
        await connectDB();

        // Start the server (works for both local dev and Elastic Beanstalk)
        app.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
        });

        // Start the scheduler cron job (runs every minute)
        startSchedulerCron();
    } catch (error) {
        console.error('Failed to start server:', error);
    }
};

// Scheduler Cron Job - checks and publishes due posts every minute
const startSchedulerCron = () => {
    const scheduler = new SchedulerController();
    const liveGenService = new LiveGenerationService();
    const autopilotService = new AutopilotService();
    const CRON_INTERVAL = 60 * 1000; // 1 minute
    const AUTOPILOT_INTERVAL = 60 * 60 * 1000; // 1 hour (check hourly, run daily)

    console.log('📅 [CRON] Scheduler cron job started - checking every minute');
    console.log('🔄 [CRON] Live generation cron job started - checking every minute');
    console.log('🤖 [CRON] Autopilot cron job started - checking every hour');

    // Every minute cron
    setInterval(async () => {
        try {
            // Process scheduled posts
            const schedulerResult = await scheduler.processDuePosts();
            if (schedulerResult.processed > 0) {
                console.log(`📅 [CRON] Processed ${schedulerResult.processed} scheduled posts`);
            }

            // Process live generation jobs
            const liveGenResult = await liveGenService.processDueJobs();
            if (liveGenResult.processed > 0) {
                console.log(`🔄 [CRON] Processed ${liveGenResult.processed} live generation jobs`);
            }
        } catch (error) {
            console.error('❌ [CRON] Cron error:', error);
        }
    }, CRON_INTERVAL);

    // Autopilot daily cron (runs at 8 AM check)
    let lastAutopilotRun = null;
    setInterval(async () => {
        try {
            const now = new Date();
            const hour = now.getHours();
            const today = now.toDateString();

            // Run autopilot once per day at 8 AM
            if (hour === 8 && lastAutopilotRun !== today) {
                console.log('🤖 [AUTOPILOT] Starting daily autopilot run...');
                const results = await autopilotService.runDailyAutopilot();
                console.log(`🤖 [AUTOPILOT] Completed. Processed ${results.length} accounts`);
                lastAutopilotRun = today;
            }
        } catch (error) {
            console.error('❌ [AUTOPILOT] Cron error:', error);
        }
    }, AUTOPILOT_INTERVAL);
};

startServer();

// Export for Vercel
module.exports = app;