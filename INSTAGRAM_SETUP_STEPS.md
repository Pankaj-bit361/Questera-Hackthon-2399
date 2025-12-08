# 🎬 Instagram OAuth Setup - Step by Step

## 🎯 Goal
Connect your Instagram Business Account to auto-publish generated images.

---

## 📱 STEP 1: Create Facebook App (2 minutes)

### 1.1 Go to Facebook Developers
```
https://developers.facebook.com/
```

### 1.2 Create New App
- Click **"My Apps"** (top right)
- Click **"Create App"**
- Select **"Business"** type
- Click **"Next"**

### 1.3 Fill App Details
```
App Name: Questera
App Purpose: Other
```
- Click **"Create App"**

---

## 🔑 STEP 2: Get App Credentials (1 minute)

### 2.1 Find Your Credentials
- Go to **Settings** → **Basic**
- You'll see:
  - **App ID** (copy this)
  - **App Secret** (copy this)

### 2.2 Save Credentials
```
App ID: ________________________
App Secret: ________________________
```

---

## 🌐 STEP 3: Configure Domains (2 minutes)

### 3.1 Add App Domains
- Still in **Settings** → **Basic**
- Find **"App Domains"** section
- Click **"Add Domain"**
- Add these domains:
  ```
  localhost:5173
  localhost:3001
  ```

### 3.2 Save Changes
- Click **"Save Changes"**

---

## 📲 STEP 4: Add Instagram Product (2 minutes)

### 4.1 Add Product
- Click **"Add Product"** (left sidebar)
- Search for **"Instagram Graph API"**
- Click **"Set Up"**

### 4.2 Choose Account Type
- Select **"Business Account"**
- Click **"Next"**

---

## 🔐 STEP 5: Configure OAuth Redirect (2 minutes)

### 5.1 Go to Instagram Settings
- Click **"Instagram Graph API"** (left sidebar)
- Click **"Settings"**

### 5.2 Add Redirect URI
- Find **"Valid OAuth Redirect URIs"**
- Click **"Add URI"**
- Paste:
  ```
  http://localhost:5173/#/instagram/callback
  ```
- Click **"Save Changes"**

---

## 🔧 STEP 6: Update Your Code (1 minute)

### 6.1 Open Backend .env File
```
Questera-Backend/.env
```

### 6.2 Add These Lines
```env
INSTAGRAM_APP_ID=your_app_id_here
INSTAGRAM_APP_SECRET=your_app_secret_here
INSTAGRAM_REDIRECT_URI=http://localhost:5173/#/instagram/callback
```

Replace:
- `your_app_id_here` with your App ID from Step 2
- `your_app_secret_here` with your App Secret from Step 2

### 6.3 Save File
- Press **Ctrl+S**

---

## 🚀 STEP 7: Start Your Servers (2 minutes)

### 7.1 Terminal 1 - Start Backend
```bash
cd Questera-Backend
npm start
```

Wait for:
```
✅ Server running on port 3001
```

### 7.2 Terminal 2 - Start Frontend
```bash
cd Questera-Frontend
npm run dev
```

Wait for:
```
✅ Local: http://localhost:5173
```

---

## 🧪 STEP 8: Test It! (1 minute)

### 8.1 Open Your App
```
http://localhost:5173
```

### 8.2 Find Instagram Section
- Scroll down to bottom
- Look for **"Instagram Integration"** section
- You should see a purple gradient box

### 8.3 Click Connect
- Click **"Connect Instagram"** button
- You'll be redirected to Facebook login

### 8.4 Authorize
- Log in with your Facebook account
- Click **"Continue"** to authorize
- You should see success message
- Auto-redirect back to homepage

### 8.5 Verify Connection
- You should see:
  - ✅ Your Instagram profile picture
  - ✅ Your username (@yourname)
  - ✅ "Connected & Ready to Post" message
  - ✅ "Disconnect" button

---

## ✅ Success!

If you see all of the above, your Instagram OAuth is working! 🎉

---

## 🐛 Troubleshooting

### Problem: "Invalid OAuth Redirect URI"
**Solution:**
- Check redirect URI in Facebook settings
- Must be EXACTLY: `http://localhost:5173/#/instagram/callback`
- No extra spaces or slashes

### Problem: "No Instagram Business Account"
**Solution:**
- Your Instagram must be Business type (not Personal)
- Must be linked to a Facebook Page
- Go to Instagram Settings → Account → Switch to Professional Account

### Problem: "Token exchange failed"
**Solution:**
- Verify App ID is correct
- Verify App Secret is correct
- Code expires after 10 minutes, try again

### Problem: Page shows nothing
**Solution:**
- Make sure backend is running on port 3001
- Make sure frontend is running on port 5173
- Check browser console for errors (F12)

---

## 📚 Next Steps

After OAuth works:
1. ✅ Generate images
2. ✅ Click "Connect Instagram"
3. ✅ Create publish endpoint
4. ✅ Auto-post to Instagram

---

## 💡 Tips

- Keep your App Secret **SECRET** - never share it
- Don't commit `.env` file to git
- Test on localhost first before production
- Instagram Business Account is required (not Personal)

---

## 📞 Need Help?

Check these files:
- `INSTAGRAM_OAUTH_SETUP.md` - Detailed technical guide
- `INSTAGRAM_QUICK_START.md` - Quick reference
- `INSTAGRAM_SETUP_CHECKLIST.md` - Verification checklist

