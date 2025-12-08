# Instagram OAuth Integration Setup Guide

## 🎯 Overview
This guide walks you through setting up Instagram OAuth for auto-publishing generated images.

## 📋 Prerequisites
- Facebook Developer Account
- Instagram Business Account
- Facebook Page linked to Instagram

## 🔧 Step 1: Create Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click "My Apps" → "Create App"
3. Choose "Business" type
4. Fill in app details:
   - **App Name**: Questera
   - **App Purpose**: Select "Other"
5. Click "Create App"

## 🔑 Step 2: Get App Credentials

1. Go to Settings → Basic
2. Copy:
   - **App ID** → `INSTAGRAM_APP_ID`
   - **App Secret** → `INSTAGRAM_APP_SECRET`

## 🌐 Step 3: Configure OAuth Redirect URI

1. Go to Settings → Basic
2. Add "App Domains":
   - `localhost:5173`
   - `localhost:3001`
   - Your production domain

3. Go to Products → Instagram Basic Display
4. Click "Settings"
5. Add "Valid OAuth Redirect URIs":
   - `http://localhost:5173/#/instagram/callback`
   - Your production callback URL

## 📱 Step 4: Add Instagram Product

1. Click "Add Product"
2. Find "Instagram Graph API"
3. Click "Set Up"
4. Choose "Business Account"

## 🔐 Step 5: Get Required Permissions

Required scopes:
- `instagram_basic` - Get account info
- `instagram_content_publish` - Publish posts
- `pages_show_list` - List pages
- `instagram_manage_comments` - Manage comments
- `pages_read_engagement` - Read insights
- `pages_manage_posts` - Manage posts

## 🛠️ Step 6: Update Environment Variables

In `Questera-Backend/.env`:

```env
INSTAGRAM_APP_ID=your_app_id
INSTAGRAM_APP_SECRET=your_app_secret
INSTAGRAM_REDIRECT_URI=http://localhost:5173/#/instagram/callback
```

## 🚀 Step 7: Test OAuth Flow

1. Start backend: `npm start` (in Questera-Backend)
2. Start frontend: `npm run dev`
3. Navigate to home page
4. Click "Connect Instagram"
5. Authorize the app
6. You should be redirected back with success message

## 📊 API Endpoints

### Get OAuth URL
```
GET /api/instagram/oauth-url
Response: { success: true, oauthUrl: "...", state: "..." }
```

### Handle Callback
```
POST /api/instagram/callback
Body: { code, state, userId }
Response: { success: true, instagram: {...} }
```

### Get Instagram Info
```
GET /api/instagram/info/:userId
Response: { success: true, instagram: {...} }
```

### Disconnect
```
POST /api/instagram/disconnect/:userId
Response: { success: true, message: "..." }
```

## 🎨 Frontend Components

### InstagramConnect.jsx
- Shows connection status
- Handles OAuth flow
- Displays user info when connected

### InstagramCallback.jsx
- Handles OAuth callback
- Exchanges code for token
- Redirects on success/error

## 🔄 OAuth Flow Diagram

```
User clicks "Connect Instagram"
         ↓
Frontend calls GET /api/instagram/oauth-url
         ↓
Redirects to Facebook OAuth dialog
         ↓
User authorizes app
         ↓
Facebook redirects to callback URL with code
         ↓
Frontend calls POST /api/instagram/callback
         ↓
Backend exchanges code for access token
         ↓
Backend fetches user info & IG Business Account ID
         ↓
Backend saves to MongoDB
         ↓
Frontend redirects to home with success
```

## 🐛 Troubleshooting

### "Invalid OAuth Redirect URI"
- Check redirect URI matches exactly in Facebook settings
- Include protocol (http/https) and port

### "No Instagram Business Account found"
- Ensure Instagram account is Business type
- Ensure Facebook Page is linked to Instagram

### "Token exchange failed"
- Verify App ID and App Secret are correct
- Check code hasn't expired (valid for ~10 minutes)

## 📚 Resources

- [Instagram Graph API Docs](https://developers.facebook.com/docs/instagram-api)
- [OAuth 2.0 Flow](https://developers.facebook.com/docs/facebook-login/web)
- [Permissions Reference](https://developers.facebook.com/docs/permissions/reference)

## ✅ Next Steps

After OAuth is working:
1. Create endpoint to publish images to Instagram
2. Add caption/hashtag support
3. Implement scheduling
4. Add analytics tracking

