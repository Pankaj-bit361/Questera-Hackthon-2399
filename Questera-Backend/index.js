require('dotenv').config();
const express = require('express');
const cors = require('cors');
const imageRouter = require('./routes/Image');
const authRouter = require('./routes/Auth');
const authMiddleware = require('./middlewares/auth');
const connectDB = require('./db');

const app = express();
const port = 3001;


app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for image uploads

// Test route
app.get('/test', (req, res) => {
    res.json({ message: 'Server is working!' });
});



// Public routes
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/image', authMiddleware, imageRouter);

// Connect to database
connectDB().then(() => {
    console.log('MongoDB connected');
}).catch((error) => {
    console.error('MongoDB connection error:', error);
});

// For local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
}

// Export for Vercel
module.exports = app;