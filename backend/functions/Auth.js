const { OAuth2Client } = require('google-auth-library');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

class AuthController {
    constructor() {
        this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        this.ses = new SESClient({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        this.jwtSecret = process.env.JWT_SECRET;
        this.senderEmail = process.env.SES_SENDER_EMAIL;
    }

    generateToken(user) {
        return jwt.sign(
            { id: user._id, userId: user.userId, email: user.email },
            this.jwtSecret,
            { expiresIn: '7d' }
        );
    }

    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    /**
     * Google OAuth login
     */
    async googleLogin(req, res) {
        try {
            const { idToken } = req.body;

            if (!idToken) {
                return { status: 400, json: { error: 'ID token is required' } };
            }

            // Verify Google token
            const ticket = await this.googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });

            const payload = ticket.getPayload();
            const { sub: googleId, email, name, picture } = payload;

            // Find or create user
            let user = await User.findOne({ email });

            if (user) {
                // Update existing user
                user.googleId = googleId;
                user.name = name || user.name;
                user.avatar = picture || user.avatar;
                user.lastLogin = new Date();
                user.isVerified = true;
                await user.save();
            } else {
                // Create new user
                user = await User.create({
                    email,
                    name,
                    avatar: picture,
                    authProvider: 'google',
                    googleId,
                    isVerified: true,
                    lastLogin: new Date(),
                });
            }

            const token = this.generateToken(user);

            return {
                status: 200,
                json: {
                    success: true,
                    token,
                    user: {
                        userId: user.userId,
                        email: user.email,
                        name: user.name,
                        avatar: user.avatar,
                    },
                },
            };
        } catch (error) {
            console.error('Google login error:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Send OTP to email
     */
    async sendOTP(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return { status: 400, json: { error: 'Email is required' } };
            }

            const otp = this.generateOTP();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

            // Log OTP for development
            console.log(`\n🔐 OTP for ${email}: ${otp}\n`);

            // Find or create user
            let user = await User.findOne({ email });

            if (user) {
                user.otp = { code: otp, expiresAt };
                await user.save();
            } else {
                user = await User.create({
                    email,
                    authProvider: 'email',
                    otp: { code: otp, expiresAt },
                });
            }

            // Send email via SES
            const emailParams = {
                Source: this.senderEmail,
                Destination: { ToAddresses: [email] },
                Message: {
                    Subject: { Data: 'Your Instapixel Login Code' },
                    Body: {
                        Html: {
                            Data: `
                                <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
                                    <h2>Your Login Code</h2>
                                    <p style="font-size: 32px; font-weight: bold; color: #4F46E5;">${otp}</p>
                                    <p>This code expires in 10 minutes.</p>
                                    <p>If you didn't request this code, please ignore this email.</p>
                                </div>
                            `,
                        },
                    },
                },
            };

            await this.ses.send(new SendEmailCommand(emailParams));

            return {
                status: 200,
                json: { success: true, message: 'OTP sent to email' },
            };
        } catch (error) {
            console.error('Send OTP error:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Verify OTP and login
     */
    async verifyOTP(req, res) {
        try {
            const { email, otp } = req.body;

            if (!email || !otp) {
                return { status: 400, json: { error: 'Email and OTP are required' } };
            }

            const user = await User.findOne({ email });

            if (!user) {
                return { status: 404, json: { error: 'User not found' } };
            }

            if (!user.otp || !user.otp.code) {
                return { status: 400, json: { error: 'No OTP requested' } };
            }

            if (user.otp.expiresAt < new Date()) {
                return { status: 400, json: { error: 'OTP expired' } };
            }

            if (user.otp.code !== otp) {
                return { status: 400, json: { error: 'Invalid OTP' } };
            }

            // Clear OTP and update user
            user.otp = undefined;
            user.isVerified = true;
            user.lastLogin = new Date();
            await user.save();

            const token = this.generateToken(user);

            return {
                status: 200,
                json: {
                    success: true,
                    token,
                    user: {
                        userId: user.userId,
                        email: user.email,
                        name: user.name,
                        avatar: user.avatar,
                    },
                },
            };
        } catch (error) {
            console.error('Verify OTP error:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Get current user profile
     */
    async getProfile(req, res) {
        try {
            const user = await User.findById(req.user.id).select('-otp');

            if (!user) {
                return { status: 404, json: { error: 'User not found' } };
            }

            return {
                status: 200,
                json: {
                    userId: user.userId,
                    email: user.email,
                    name: user.name,
                    avatar: user.avatar,
                    isVerified: user.isVerified,
                    createdAt: user.createdAt,
                },
            };
        } catch (error) {
            console.error('Get profile error:', error);
            return { status: 500, json: { error: error.message } };
        }
    }
}

module.exports = AuthController;
