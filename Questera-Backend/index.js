require('dotenv').config();
const express = require('express');
const cors = require('cors');
const imageRouter = require('./routes/Image');
const authRouter = require('./routes/Auth');
const templateRouter = require('./routes/Template');
const instagramRouter = require('./routes/Instagram');
const chatRouter = require('./routes/Chat');
const creditsRouter = require('./routes/Credits');
const authMiddleware = require('./middlewares/auth');
const connectDB = require('./db');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for image uploads

// Increase timeout for long-running requests (image generation can take 60+ seconds)
app.use((req, res, next) => {
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
    next();
});

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Server is working!' });
});

// Public routes
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/image', imageRouter);
app.use('/api/template', templateRouter);
app.use('/api/instagram', instagramRouter);
app.use('/api/chat', chatRouter); // Smart AI Chat & Image Generation
app.use('/api/credits', creditsRouter); // Credits & Subscription Management

// Database connection and Server Start
const startServer = async () => {
    try {
        // Connect to DB before starting server to prevent buffering timeouts
        await connectDB();

        // Only listen when running locally/dev (Vercel handles this automatically)
        if (process.env.NODE_ENV !== 'production') {
            app.listen(port, () => {
                console.log(`🚀 Server running on http://localhost:${port}`);
            });
        }
    } catch (error) {
        console.error('Failed to start server:', error);
    }
};

startServer();

// Export for Vercel
module.exports = app;