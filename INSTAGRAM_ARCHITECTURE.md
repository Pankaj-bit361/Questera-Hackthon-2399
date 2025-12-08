# 🏗️ Instagram OAuth Architecture

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     QUESTERA APP                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐         ┌──────────────────────┐  │
│  │   FRONTEND (React)   │         │  BACKEND (Node.js)   │  │
│  │                      │         │                      │  │
│  │ InstagramConnect.jsx │◄───────►│ Instagram.js         │  │
│  │ InstagramCallback.jsx│         │ instagram.js (model) │  │
│  │                      │         │ Instagram.js (route) │  │
│  └──────────────────────┘         └──────────────────────┘  │
│           │                                │                 │
│           │                                │                 │
│           └────────────────┬───────────────┘                 │
│                            │                                 │
│                    ┌───────▼────────┐                        │
│                    │   MongoDB      │                        │
│                    │  (Instagram    │                        │
│                    │   Credentials) │                        │
│                    └────────────────┘                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
┌──────────────────┐                  ┌──────────────────┐
│  Facebook OAuth  │                  │  Instagram API   │
│  (Login)         │                  │  (Publish)       │
└──────────────────┘                  └──────────────────┘
```

---

## 🔄 OAuth Flow Sequence

```
1. USER CLICKS "CONNECT INSTAGRAM"
   │
   ├─► Frontend calls GET /api/instagram/oauth-url
   │
   ├─► Backend generates OAuth URL with scopes
   │
   ├─► Frontend redirects to Facebook login
   │
   └─► User logs in & authorizes app

2. FACEBOOK REDIRECTS WITH CODE
   │
   ├─► Callback URL: http://localhost:5173/#/instagram/callback?code=...
   │
   ├─► Frontend extracts code from URL
   │
   ├─► Frontend calls POST /api/instagram/callback with code
   │
   └─► Backend receives code

3. BACKEND EXCHANGES CODE FOR TOKEN
   │
   ├─► POST to https://graph.instagram.com/oauth/access_token
   │
   ├─► Gets short-lived access token
   │
   ├─► Exchanges for long-lived token
   │
   └─► Token valid for ~60 days

4. BACKEND FETCHES USER INFO
   │
   ├─► GET https://graph.instagram.com/me
   │
   ├─► Gets user ID, username, profile picture
   │
   ├─► Gets Instagram Business Account ID
   │
   └─► Stores in MongoDB

5. SUCCESS!
   │
   ├─► Frontend shows profile info
   │
   ├─► User can now publish images
   │
   └─► Token stored for future use
```

---

## 📁 File Structure

```
Questera-Backend/
├── models/
│   └── instagram.js          # MongoDB schema
├── functions/
│   └── Instagram.js          # OAuth logic
├── routes/
│   └── Instagram.js          # API endpoints
└── index.js                  # Register routes

src/
├── components/
│   ├── InstagramConnect.jsx  # UI component
│   ├── InstagramCallback.jsx # Callback handler
│   └── HomePage.jsx          # Integrated
└── App.jsx                   # Routes
```

---

## 🔐 Required Scopes

```
instagram_basic
├─ Get account info
├─ Get username
└─ Get profile picture

instagram_content_publish
├─ Publish images
├─ Publish captions
└─ Publish hashtags

pages_show_list
├─ List Facebook pages
└─ Get page ID

instagram_manage_comments
├─ Read comments
└─ Reply to comments

pages_read_engagement
├─ Read insights
├─ Get engagement metrics
└─ Get analytics

pages_manage_posts
├─ Manage posts
├─ Delete posts
└─ Edit posts
```

---

## 💾 Database Schema

```javascript
Instagram {
  userId: String (unique)
  instagramBusinessAccountId: String
  facebookPageId: String
  accessToken: String (encrypted)
  refreshToken: String
  tokenExpiresAt: Date
  instagramUsername: String
  instagramName: String
  profilePictureUrl: String
  isConnected: Boolean
  lastTokenRefresh: Date
  connectedAt: Date
  createdAt: Date
  updatedAt: Date
}
```

---

## 🔌 API Endpoints

### 1. Get OAuth URL
```
GET /api/instagram/oauth-url

Response:
{
  success: true,
  oauthUrl: "https://www.facebook.com/v20.0/dialog/oauth?...",
  state: "random_string"
}
```

### 2. Handle Callback
```
POST /api/instagram/callback

Body:
{
  code: "authorization_code",
  state: "random_string",
  userId: "user_id"
}

Response:
{
  success: true,
  message: "Instagram connected successfully",
  instagram: {
    username: "@username",
    name: "Full Name",
    profilePictureUrl: "https://..."
  }
}
```

### 3. Get Instagram Info
```
GET /api/instagram/info/:userId

Response:
{
  success: true,
  instagram: {
    username: "@username",
    name: "Full Name",
    profilePictureUrl: "https://...",
    isConnected: true,
    connectedAt: "2024-01-01T00:00:00Z"
  }
}
```

### 4. Disconnect
```
POST /api/instagram/disconnect/:userId

Response:
{
  success: true,
  message: "Instagram disconnected"
}
```

---

## 🔄 Token Refresh Flow (Future)

```
1. Check if token expires in 7 days
2. If yes, refresh token
3. Get new long-lived token
4. Update in database
5. Continue using new token
```

---

## 🚀 Publishing Flow (Next Phase)

```
1. User generates image
2. User clicks "Publish to Instagram"
3. Frontend calls POST /api/instagram/publish
4. Backend uploads image to Instagram
5. Image appears on Instagram feed
6. Success notification
```

---

## 🔒 Security Considerations

- ✅ App Secret never exposed to frontend
- ✅ Access tokens stored in database (encrypted)
- ✅ Tokens never logged or exposed
- ✅ HTTPS required in production
- ✅ CORS configured properly
- ✅ Rate limiting on API calls
- ✅ User authentication required

---

## 📈 Monitoring & Logging

```
✅ Log OAuth flow steps
✅ Log token exchanges
✅ Log API calls
✅ Monitor token expiration
✅ Alert on failed connections
✅ Track user connections
```

---

## 🎯 Future Enhancements

1. **Token Refresh** - Auto-refresh before expiration
2. **Batch Publishing** - Publish multiple images
3. **Scheduling** - Schedule posts for later
4. **Analytics** - Track post performance
5. **Comments** - Manage comments on posts
6. **Stories** - Publish to Instagram Stories
7. **Reels** - Publish video reels
8. **Multi-Account** - Connect multiple accounts

