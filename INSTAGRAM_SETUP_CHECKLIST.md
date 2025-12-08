# ✅ Instagram OAuth Setup Checklist

## 📋 Pre-Setup Requirements
- [ ] Facebook Developer Account (create at https://developers.facebook.com/)
- [ ] Instagram Business Account
- [ ] Facebook Page linked to Instagram

## 🔧 Facebook App Setup

### Create App
- [ ] Go to https://developers.facebook.com/
- [ ] Click "My Apps" → "Create App"
- [ ] Select "Business" type
- [ ] Name: "Questera"
- [ ] Click "Create App"

### Get Credentials
- [ ] Go to Settings → Basic
- [ ] Copy **App ID** → Save to notes
- [ ] Copy **App Secret** → Save to notes
- [ ] Copy **App Domains** section

### Configure Domains
- [ ] Settings → Basic
- [ ] Add App Domains:
  - [ ] `localhost:5173`
  - [ ] `localhost:3001`
  - [ ] Your production domain (if applicable)

### Add Instagram Product
- [ ] Click "Add Product"
- [ ] Find "Instagram Graph API"
- [ ] Click "Set Up"
- [ ] Choose "Business Account"

### Configure OAuth
- [ ] Go to Instagram Graph API → Settings
- [ ] Add Valid OAuth Redirect URIs:
  - [ ] `http://localhost:5173/#/instagram/callback`
  - [ ] Your production callback URL (if applicable)

## 🔐 Environment Setup

### Backend Configuration
- [ ] Open `Questera-Backend/.env`
- [ ] Add:
  ```
  INSTAGRAM_APP_ID=your_app_id
  INSTAGRAM_APP_SECRET=your_app_secret
  INSTAGRAM_REDIRECT_URI=http://localhost:5173/#/instagram/callback
  ```
- [ ] Save file

### Verify Files Exist
- [ ] `Questera-Backend/models/instagram.js` ✅
- [ ] `Questera-Backend/functions/Instagram.js` ✅
- [ ] `Questera-Backend/routes/Instagram.js` ✅
- [ ] `src/components/InstagramConnect.jsx` ✅
- [ ] `src/components/InstagramCallback.jsx` ✅

## 🚀 Start Servers

### Terminal 1 - Backend
- [ ] `cd Questera-Backend`
- [ ] `npm start`
- [ ] Wait for "Server running on port 3001"

### Terminal 2 - Frontend
- [ ] `cd Questera-Frontend` (or your frontend directory)
- [ ] `npm run dev`
- [ ] Wait for "Local: http://localhost:5173"

## 🧪 Test OAuth Flow

- [ ] Open http://localhost:5173 in browser
- [ ] Scroll down to "Instagram Integration" section
- [ ] Click "Connect Instagram" button
- [ ] You should be redirected to Facebook login
- [ ] Log in with your Facebook account
- [ ] Authorize the app
- [ ] You should see success message
- [ ] Should redirect back to homepage
- [ ] Instagram profile info should display

## ✨ Verify Connection

- [ ] Profile picture displays
- [ ] Username shows (@yourname)
- [ ] "Connected & Ready to Post" message appears
- [ ] "Disconnect" button is visible

## 🎉 Success!

If all checkboxes are complete, your Instagram OAuth is working! 🚀

## 🐛 If Something Goes Wrong

### Issue: "Invalid OAuth Redirect URI"
- [ ] Check redirect URI matches EXACTLY in Facebook settings
- [ ] Include `http://` and port number
- [ ] No trailing slashes

### Issue: "No Instagram Business Account"
- [ ] Verify Instagram account is Business type
- [ ] Verify Facebook Page is linked to Instagram
- [ ] Try disconnecting and reconnecting

### Issue: "Token exchange failed"
- [ ] Verify App ID is correct
- [ ] Verify App Secret is correct
- [ ] Check code hasn't expired (valid for ~10 minutes)

### Issue: "CORS Error"
- [ ] Verify backend is running on port 3001
- [ ] Check CORS is enabled in backend
- [ ] Verify API URLs are correct

## 📞 Need Help?

See detailed docs:
- `INSTAGRAM_OAUTH_SETUP.md` - Full setup guide
- `INSTAGRAM_QUICK_START.md` - Quick reference

