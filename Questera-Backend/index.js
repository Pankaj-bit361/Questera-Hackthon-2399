require('dotenv').config();
const express = require('express');
const cors = require('cors');
const imageRouter = require('./routes/Image');
const authRouter = require('./routes/Auth');
const templateRouter = require('./routes/Template');
const draftTemplateRouter = require('./routes/DraftTemplate');
const instagramRouter = require('./routes/Instagram');
const linkedinRouter = require('./routes/LinkedIn');
const twitterRouter = require('./routes/Twitter');
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
const { requireUser, requireAdmin, ownedBodyIds } = require('./middlewares/auth');
const connectDB = require('./db');
const SchedulerController = require('./functions/Scheduler');
const LiveGenerationService = require('./functions/LiveGenerationService');

const app = express();
const port = process.env.PORT || 8080;

// Set DISABLE_CRONS=true to serve the API without starting the background
// workers. Those workers publish to real social accounts and spend credits on
// image/video generation, and processDuePosts holds no cross-instance lock -
// so a laptop pointed at the production database would race the deployed
// server and double-post. Local development should almost always set this.
const CRONS_DISABLED = String(process.env.DISABLE_CRONS || '').toLowerCase() === 'true';

app.use(cors());
app.use(express.json({ limit: '200mb', verify:(req,res,buffer)=>{if(req.originalUrl.startsWith('/api/credits/webhook/razorpay')||req.originalUrl.startsWith('/api/integrations/'))req.rawBody=Buffer.from(buffer);} }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// Increase timeout for long-running requests (image generation can take 60+ seconds)
app.use((req, res, next) => {
    req.setTimeout(1000000);
    res.setTimeout(1000000);
    next();
});


// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Server is working!' });
});

// Every /api route needs a login, except these. Motion and Studio check their own tokens (Studio's /media links are
// signed). /api/email/send takes a service key instead (routes/Email.js).
const PUBLIC_ROUTES = [
    [null, /^\/api\/auth\/(google|send-otp|verify-otp)$/],
    ['POST', /^\/api\/credits\/webhook\/razorpay$/],
    ['GET', /^\/api\/credits\/plans\/all$/],
    ['GET', /^\/api\/email-campaign\/(track\/(open|click)\/[^/]+|unsubscribe)$/],
    ['POST', /^\/api\/email\/send$/],
    [null, /^\/api\/(motion|studio)(\/|$)/],
    ['POST', /^\/api\/integrations\/seovyn\/[^/]+$/], // signed by Seovyn (routes/Integrations.js)
];
// Logged in, and the email is in ADMIN_EMAILS: internal tools and manual cron triggers.
const ADMIN_ROUTES = [
    [null, /^\/api\/email-campaign(\/|$)/],
    [null, /^\/api\/draft-template(\/|$)/],
    ['POST', /^\/api\/template\/(create|create-from-urls)$/],
    ['PUT', /^\/api\/template\/[^/]+$/],
    ['DELETE', /^\/api\/template\/[^/]+$/],
    ['POST', /^\/api\/(scheduler|live-generation)\/process$/],
    [null, /^\/api\/analytics\/(debug|test-instagram|fix-media-ids)\//],
];
const matches = (list, req) => {
    const path = (req.baseUrl + req.path).replace(/\/+$/, '') || '/';
    return list.some(([method, re]) => (!method || method === req.method) && re.test(path));
};
// Records a request body names by id must be the caller's (ids with no record yet are allowed).
const ownedBody = ownedBodyIds({
    imageChatId: require('./models/image'),
    videoChatId: require('./models/video'),
    autopilotId: require('./models/autopilot'),
    campaignId: require('./models/campaign'),
    postId: require('./models/scheduledPost'),
    taskId: require('./models/autopilotTask'),
    accountId: require('./models/socialAccount'),
});
app.use('/api', (req, res, next) => {
    if (matches(PUBLIC_ROUTES, req)) return next();
    requireUser(req, res, () => {
        const then = () => ownedBody(req, res, next);
        return matches(ADMIN_ROUTES, req) ? requireAdmin(req, res, then) : then();
    });
});

app.use('/api/auth', authRouter);
app.use('/api/integrations', require('./routes/Integrations'));
app.use('/api/email', emailRouter);

app.use('/api/image', imageRouter);
app.use('/api/template', templateRouter);
app.use('/api/draft-template', draftTemplateRouter); // Draft Template Management
app.use('/api/instagram', instagramRouter);
app.use('/api/linkedin', linkedinRouter); // LinkedIn connect + publish (auth required)
app.use('/api/twitter', twitterRouter); // X/Twitter connect + publish (auth required)
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

        // Motion owns its authentication, private asset URLs, and durable render queue.
        if (process.env.MOTION_PUBLIC_API_URL) {
            const {createMotionRouter} = require('./motion/router.cjs');
            const motion = createMotionRouter();
            app.use('/api/motion', motion.router);
        }

        // Studio: website in, product videos out. STUDIO_RUNNER=fargate renders each job in its own AWS Fargate task with
        // files in S3; without it jobs render in this process (see Questera-Backend/studio and deploy/studio/README.md).
        if (process.env.STUDIO_ENABLED === 'true') {
            const {createStudioRouter} = require('./studio/router.cjs');
            const {studioJobs} = require('./studio/service.cjs');
            // One instance, shared with the autopilot, which makes product videos with it.
            const studio = createStudioRouter({jobs: studioJobs(), secret: process.env.JWT_SECRET});
            app.use('/api/studio', studio.router);
        }

        // Start the server (works for both local dev and Elastic Beanstalk)
        app.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
        });

        if (CRONS_DISABLED) {
            console.log('⏸️  [CRON] All background workers disabled (DISABLE_CRONS=true)');
            console.log('    Scheduled posts will NOT publish and autopilot will NOT run.');
        } else {
            // Start the scheduler cron job (runs every minute)
            startSchedulerCron();
            require('./functions/MediaJobCron').startMediaJobCron();
            require('./functions/EngagementCron').startEngagementCron();
            require('./functions/TaskRunner').startTaskCron();
        }
    } catch (error) {
        console.error('Failed to start server:', error);
    }
};

// Scheduler Cron Job - checks and publishes due posts every minute
const startSchedulerCron = () => {
    const scheduler = new SchedulerController();
    const liveGenService = new LiveGenerationService();
    const CRON_INTERVAL = 60 * 1000; // 1 minute

    console.log('📅 [CRON] Scheduler cron job started - checking every minute');
    console.log('🔄 [CRON] Live generation cron job started - checking every minute');

    // Every minute cron. A slow tick (a video upload can take minutes) makes the next one skip rather than overlap;
    // posts are claimed one by one anyway (ScheduledPost.claimNextDue), so other servers are safe too.
    let ticking = false;
    setInterval(async () => {
        if (ticking) return;
        ticking = true;
        try {
            // Autopilot posts whose 12-hour hold ran out are approved first, so they can go out this tick.
            await require('./functions/TrustLadder').approveHeldPosts().catch((err) => console.error('❌ [CRON] Held posts:', err.message));

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
        } finally {
            ticking = false;
        }
    }, CRON_INTERVAL);

    // Autopilot runs on the task engine (functions/TaskRunner.js): each platform's daily plan is a task there,
    // next to the recurring tasks.
};

// Tests load the app without starting the server or the background workers.
if (process.env.VELOS_NO_START !== 'true') startServer();

// Export for Vercel
module.exports = app;