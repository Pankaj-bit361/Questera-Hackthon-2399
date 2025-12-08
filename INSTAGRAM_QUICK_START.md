# 🚀 Instagram OAuth - Quick Start Guide

## ⚡ 5-Minute Setup

### Step 1: Create Facebook App
1. Go to https://developers.facebook.com/
2. Click "My Apps" → "Create App"
3. Choose "Business" type
4. Name it "Questera"
5. Click "Create App"

### Step 2: Get Credentials
1. Go to Settings → Basic
2. Copy **App ID** and **App Secret**
3. Save them somewhere safe

### Step 3: Configure Redirect URI
1. Settings → Basic
2. Add App Domains:
   - `localhost:5173`
   - `localhost:3001`

3. Products → Instagram Graph API → Settings
4. Add Valid OAuth Redirect URIs:
   - `http://localhost:5173/#/instagram/callback`

### Step 4: Update .env
Create/update `Questera-Backend/.env`:

```env
INSTAGRAM_APP_ID=your_app_id_here
INSTAGRAM_APP_SECRET=your_app_secret_here
INSTAGRAM_REDIRECT_URI=http://localhost:5173/#/instagram/callback
```

### Step 5: Start Servers
```bash
# Terminal 1 - Backend
cd Questera-Backend
npm start

# Terminal 2 - Frontend
cd Questera-Frontend
npm run dev
```

### Step 6: Test It!
1. Open http://localhost:5173
2. Scroll down to "Instagram Integration"
3. Click "Connect Instagram"
4. Authorize the app
5. Done! ✅

## 🔧 Troubleshooting

### "Invalid OAuth Redirect URI"
- Make sure redirect URI matches EXACTLY in Facebook settings
- Include `http://` and port number

### "No Instagram Business Account"
- Your Instagram account must be Business type
- Must be linked to a Facebook Page

### "Token exchange failed"
- Check App ID and Secret are correct
- Code expires after ~10 minutes

## 📚 What's Included

✅ Complete OAuth flow
✅ Token management
✅ User info storage
✅ Beautiful UI components
✅ Error handling
✅ Auto-redirect on success

## 🎯 Next Steps

After OAuth works:
1. Create publish endpoint
2. Add image captions
3. Implement scheduling
4. Add analytics

## 📖 Full Documentation
See `INSTAGRAM_OAUTH_SETUP.md` for detailed setup

