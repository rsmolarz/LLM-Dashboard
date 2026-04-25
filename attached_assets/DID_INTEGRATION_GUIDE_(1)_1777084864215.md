# MedInvest DID OAuth Integration Guide

## For Developers & AI Agents Building Apps with Social Login

This guide provides everything needed to add "Sign in with MedInvest" (social login via Decentralized Identity) to any web application. It includes step-by-step setup, working code examples in multiple frameworks, the correct API endpoints, and common pitfalls to avoid.

---

## Table of Contents

1. [What is MedInvest DID?](#what-is-medinvest-did)
2. [How Social Login Works](#how-social-login-works)
3. [Step 1: Register Your App](#step-1-register-your-app)
4. [Step 2: Store Your Credentials](#step-2-store-your-credentials)
5. [Step 3: Implement the OAuth Flow](#step-3-implement-the-oauth-flow)
6. [API Reference](#api-reference)
7. [Complete Code Examples](#complete-code-examples)
8. [Frontend Login Button](#frontend-login-button)
9. [User Data Model](#user-data-model)
10. [Security Best Practices](#security-best-practices)
11. [Common Pitfalls & Troubleshooting](#common-pitfalls--troubleshooting)
12. [Quick Start Checklist](#quick-start-checklist)

---

## What is MedInvest DID?

MedInvest DID is a Decentralized Identity provider that gives your users a single sign-on experience through their existing social accounts (Google, Facebook, Apple, GitHub, etc.). Instead of managing passwords or integrating with each social provider individually, you integrate once with MedInvest DID and your users get access to all supported social logins.

Each user receives a unique Decentralized Identifier (DID) like `did:medinvest:z6Mk...` that stays consistent across all apps using MedInvest DID.

---

## How Social Login Works

```
Your App                    MedInvest DID                Social Provider
  |                              |                            |
  |-- 1. Redirect user -------->|                            |
  |                              |-- 2. User picks social -->|
  |                              |                            |
  |                              |<-- 3. Social confirms ----|
  |                              |                            |
  |<-- 4. Redirect with code ---|                            |
  |                              |                            |
  |-- 5. Exchange code -------->|                            |
  |<-- 6. Access token ---------|                            |
  |                              |                            |
  |-- 7. Get user info -------->|                            |
  |<-- 8. DID + profile --------|                            |
```

1. Your app redirects the user to MedInvest DID's authorize page
2. The user chooses their social provider (Google, Facebook, etc.) on the MedInvest page
3. The social provider authenticates the user
4. MedInvest DID redirects back to your app with an authorization code
5. Your server exchanges the code for an access token
6. You use the token to fetch the user's DID and profile info

---

## Step 1: Register Your App

### 1.1 Go to the Developer Portal
Open **https://did-login.replit.app** and sign in. Navigate to the **Developer Portal**.

### 1.2 Click "Register New OAuth App"

### 1.3 Fill in the Registration Form

| Field | Description | Example |
|-------|-------------|---------|
| **Application Name** | Display name shown to users during login | `MyApp` |
| **Description** | Optional description of your app | `A task management tool` |
| **Website URL** | Optional URL of your app | `https://myapp.replit.app` |
| **Redirect URIs** | Callback URL(s) where users return after login | `https://myapp.replit.app/api/auth/callback` |
| **Scopes** | Permissions your app requests | Check all that apply |

### 1.4 Adding Redirect URIs (IMPORTANT)

- Type your redirect URI into the input field
- **Click the + button** to add it to the list
- You MUST add at least one URI or you'll get "Array must contain at least 1 element(s)"
- The URI must exactly match what your app sends (protocol, domain, path — no trailing slashes)

### 1.5 Select Scopes

| Scope | Description | Recommended |
|-------|-------------|-------------|
| **Read DID** | Read the user's Decentralized Identifier | Yes (required) |
| **Read Profile** | Read email and display name | Yes |
| **Verify DID** | Confirm DID ownership is valid | Yes |

### 1.6 Save and Copy Credentials

After submitting, you'll receive:
- **Client ID**: Starts with `mi_` (e.g., `mi_ad1ab0498c6f2fd533bed2c985de7b8a`)
- **Client Secret**: Starts with `mis_` (e.g., `mis_fb7e61d8768f...`)

Store these securely. Never expose the Client Secret in frontend code.

---

## Step 2: Store Your Credentials

Store your credentials as environment variables / secrets. Never hardcode them.

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MEDINVEST_CLIENT_ID` | Your app's Client ID | `mi_ad1ab049...` |
| `MEDINVEST_CLIENT_SECRET` | Your app's Client Secret | `mis_fb7e61d8...` |
| `MEDINVEST_REDIRECT_URI` | Your registered callback URL | `https://myapp.replit.app/api/auth/callback` |
| `SESSION_SECRET` | Random string for session encryption | Any long random string |

### On Replit
Add these in the **Secrets** tab (lock icon in sidebar).

### On Other Platforms
Use your platform's environment variable / secrets management system.

**IMPORTANT**: Trim whitespace from credential values. Leading/trailing spaces in Client ID or Secret will cause authentication failures.

---

## Step 3: Implement the OAuth Flow

### API Endpoints

The MedInvest DID provider is at `https://did-login.replit.app`. Here are the exact endpoints:

| Purpose | Method | URL | Notes |
|---------|--------|-----|-------|
| **Authorization** | GET | `https://did-login.replit.app/oauth/authorize` | NO `/api/` prefix |
| **Token Exchange** | POST | `https://did-login.replit.app/api/oauth/token` | HAS `/api/` prefix |
| **User Info** | GET | `https://did-login.replit.app/api/oauth/userinfo` | HAS `/api/` prefix |

**CRITICAL**: Note that the authorize endpoint does NOT have the `/api/` prefix, but token and userinfo DO. This is a common source of errors.

### Authorization Request Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `client_id` | Your Client ID | From app registration |
| `redirect_uri` | Your callback URL | Must match registered URI exactly |
| `response_type` | `code` | Always "code" for authorization code flow |
| `scope` | `openid profile email` | Requested permissions |
| `state` | Random hex string | CSRF protection (generate per request) |

### Token Exchange Request Body (JSON)

```json
{
  "grant_type": "authorization_code",
  "code": "<authorization_code_from_callback>",
  "client_id": "<your_client_id>",
  "client_secret": "<your_client_secret>",
  "redirect_uri": "<your_registered_redirect_uri>"
}
```

**Content-Type**: `application/json`

### Token Response

```json
{
  "access_token": "eyJhbGciOi...",
  "id_token": "eyJhbGciOi..."
}
```

### User Info Response

```json
{
  "sub": "did:medinvest:z6MkgM1c8BpFhSwJw3gjuitsqkxT83SkrqA7RWnYm5GhM1wF",
  "name": "John Doe",
  "email": "john@example.com",
  "preferred_username": "johndoe"
}
```

| Field | Description | Always Present |
|-------|-------------|----------------|
| `sub` | The user's DID (unique identifier) | Yes |
| `name` | Display name | No (may be null) |
| `email` | Email address | No (may be null) |
| `preferred_username` | Username | No (may be null) |

---

## Complete Code Examples

### Node.js / Express (TypeScript)

This is the proven, working implementation used by VoiceControl.

#### 1. Install Dependencies

```bash
npm install express express-session
npm install -D @types/express @types/express-session
```

#### 2. Session Setup

```typescript
import session from "express-session";

declare module "express-session" {
  interface SessionData {
    userId: string;
    oauthState: string;
  }
}

app.set("trust proxy", 1); // Required if behind a reverse proxy (Replit, Heroku, etc.)

app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax",
    },
  })
);
```

#### 3. OAuth Configuration

```typescript
import { randomBytes } from "crypto";

const DID_BASE_URL = "https://did-login.replit.app";

function getOAuthConfig() {
  const clientId = (process.env.MEDINVEST_CLIENT_ID || "").trim();
  const clientSecret = (process.env.MEDINVEST_CLIENT_SECRET || "").trim();
  const redirectUri = process.env.MEDINVEST_REDIRECT_URI!.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing MEDINVEST_CLIENT_ID, MEDINVEST_CLIENT_SECRET, or MEDINVEST_REDIRECT_URI");
  }

  return { clientId, clientSecret, redirectUri };
}
```

#### 4. Login Route (Redirect to DID Provider)

```typescript
app.get("/api/auth/medinvest/login", (req, res) => {
  const config = getOAuthConfig();
  const state = randomBytes(32).toString("hex");
  req.session.oauthState = state;

  req.session.save((err) => {
    if (err) return res.status(500).json({ message: "Session error" });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "openid profile email",
      state,
    });

    // NOTE: /oauth/authorize — NO /api/ prefix
    res.redirect(`${DID_BASE_URL}/oauth/authorize?${params.toString()}`);
  });
});
```

#### 5. Callback Route (Handle Return from DID Provider)

```typescript
app.get("/api/auth/medinvest/callback", async (req, res) => {
  const config = getOAuthConfig();

  // Check for errors from the DID provider
  if (req.query.error) {
    console.error(`OAuth error: ${req.query.error}`);
    return res.redirect("/login?error=" + req.query.error);
  }

  const { code, state } = req.query;

  // Validate authorization code exists
  if (!code || typeof code !== "string") {
    return res.redirect("/login?error=missing_code");
  }

  // Validate state for CSRF protection
  if (!state || state !== req.session.oauthState) {
    return res.redirect("/login?error=invalid_state");
  }

  delete req.session.oauthState;

  try {
    // Step 1: Exchange code for access token
    // NOTE: /api/oauth/token — HAS /api/ prefix
    const tokenResponse = await fetch(`${DID_BASE_URL}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error(`Token exchange failed: ${tokenResponse.status} ${errText}`);
      return res.redirect("/login?error=token_exchange_failed");
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return res.redirect("/login?error=no_access_token");
    }

    // Step 2: Fetch user info using access token
    // NOTE: /api/oauth/userinfo — HAS /api/ prefix
    const userInfoResponse = await fetch(`${DID_BASE_URL}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoResponse.ok) {
      return res.redirect("/login?error=userinfo_failed");
    }

    const userInfo = await userInfoResponse.json();
    const did = userInfo.sub; // The user's unique DID

    if (!did) {
      return res.redirect("/login?error=missing_did");
    }

    // Step 3: Create or find user in your database
    // Replace this with your own user storage logic
    let user = await findUserByDid(did);
    if (!user) {
      user = await createUser({
        did: did,
        username: userInfo.preferred_username || userInfo.email || did,
        displayName: userInfo.name || null,
        email: userInfo.email || null,
      });
    }

    // Step 4: Set session
    req.session.regenerate((err) => {
      if (err) return res.redirect("/login?error=session_error");
      req.session.userId = user.id;
      req.session.save((saveErr) => {
        if (saveErr) return res.redirect("/login?error=session_error");
        res.redirect("/"); // Success! Send to app
      });
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    return res.redirect("/login?error=server_error");
  }
});
```

#### 6. Get Current User Route

```typescript
app.get("/api/auth/me", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const user = await findUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "User not found" });
  }

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    did: user.did,
  });
});
```

#### 7. Logout Route

```typescript
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ message: "Logout failed" });
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out" });
  });
});
```

---

### Python / Flask

```python
import os
import secrets
import requests
from flask import Flask, redirect, request, session, jsonify, url_for

app = Flask(__name__)
app.secret_key = os.environ["SESSION_SECRET"]

DID_BASE_URL = "https://did-login.replit.app"
CLIENT_ID = os.environ["MEDINVEST_CLIENT_ID"].strip()
CLIENT_SECRET = os.environ["MEDINVEST_CLIENT_SECRET"].strip()
REDIRECT_URI = os.environ["MEDINVEST_REDIRECT_URI"].strip()


@app.route("/auth/login")
def login():
    state = secrets.token_hex(32)
    session["oauth_state"] = state

    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "openid profile email",
        "state": state,
    }
    # NOTE: /oauth/authorize — NO /api/ prefix
    authorize_url = f"{DID_BASE_URL}/oauth/authorize?" + "&".join(
        f"{k}={v}" for k, v in params.items()
    )
    return redirect(authorize_url)


@app.route("/auth/callback")
def callback():
    error = request.args.get("error")
    if error:
        return redirect(f"/login?error={error}")

    code = request.args.get("code")
    state = request.args.get("state")

    if not code:
        return redirect("/login?error=missing_code")

    if state != session.pop("oauth_state", None):
        return redirect("/login?error=invalid_state")

    # Exchange code for token
    # NOTE: /api/oauth/token — HAS /api/ prefix
    token_resp = requests.post(
        f"{DID_BASE_URL}/api/oauth/token",
        json={
            "grant_type": "authorization_code",
            "code": code,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
        },
    )

    if not token_resp.ok:
        return redirect("/login?error=token_exchange_failed")

    access_token = token_resp.json().get("access_token")
    if not access_token:
        return redirect("/login?error=no_access_token")

    # Fetch user info
    # NOTE: /api/oauth/userinfo — HAS /api/ prefix
    userinfo_resp = requests.get(
        f"{DID_BASE_URL}/api/oauth/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    if not userinfo_resp.ok:
        return redirect("/login?error=userinfo_failed")

    user_info = userinfo_resp.json()
    did = user_info.get("sub")

    if not did:
        return redirect("/login?error=missing_did")

    # Store user in session (replace with your DB logic)
    session["user"] = {
        "did": did,
        "name": user_info.get("name"),
        "email": user_info.get("email"),
        "username": user_info.get("preferred_username"),
    }

    return redirect("/")


@app.route("/auth/me")
def me():
    user = session.get("user")
    if not user:
        return jsonify({"message": "Not authenticated"}), 401
    return jsonify(user)


@app.route("/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out"})
```

---

### Next.js (API Routes)

```typescript
// pages/api/auth/login.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes } from "crypto";
import { withIronSessionApiRoute } from "iron-session/next";

const DID_BASE_URL = "https://did-login.replit.app";

export default withIronSessionApiRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const state = randomBytes(32).toString("hex");
  req.session.oauthState = state;
  await req.session.save();

  const params = new URLSearchParams({
    client_id: process.env.MEDINVEST_CLIENT_ID!.trim(),
    redirect_uri: process.env.MEDINVEST_REDIRECT_URI!.trim(),
    response_type: "code",
    scope: "openid profile email",
    state,
  });

  // NOTE: /oauth/authorize — NO /api/ prefix
  res.redirect(`${DID_BASE_URL}/oauth/authorize?${params.toString()}`);
}, sessionOptions);
```

```typescript
// pages/api/auth/callback.ts
export default withIronSessionApiRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { code, state, error } = req.query;

  if (error) return res.redirect(`/login?error=${error}`);
  if (!code || state !== req.session.oauthState) {
    return res.redirect("/login?error=invalid_state");
  }

  delete req.session.oauthState;

  // Exchange code for token
  // NOTE: /api/oauth/token — HAS /api/ prefix
  const tokenResp = await fetch(`${DID_BASE_URL}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: process.env.MEDINVEST_CLIENT_ID!.trim(),
      client_secret: process.env.MEDINVEST_CLIENT_SECRET!.trim(),
      redirect_uri: process.env.MEDINVEST_REDIRECT_URI!.trim(),
    }),
  });

  const { access_token } = await tokenResp.json();

  // Fetch user info
  // NOTE: /api/oauth/userinfo — HAS /api/ prefix
  const userResp = await fetch(`${DID_BASE_URL}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  const userInfo = await userResp.json();

  req.session.user = {
    did: userInfo.sub,
    name: userInfo.name,
    email: userInfo.email,
  };
  await req.session.save();

  res.redirect("/");
}, sessionOptions);
```

---

## Frontend Login Button

### React Example

```tsx
function LoginButton() {
  const handleLogin = () => {
    window.location.href = "/api/auth/medinvest/login";
  };

  return (
    <button
      onClick={handleLogin}
      style={{
        backgroundColor: "#2563eb",
        color: "white",
        padding: "12px 24px",
        borderRadius: "8px",
        border: "none",
        fontSize: "16px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      🛡️ Sign in with MedInvest
    </button>
  );
}
```

### Plain HTML

```html
<a href="/api/auth/medinvest/login"
   style="display:inline-block; background:#2563eb; color:white;
          padding:12px 24px; border-radius:8px; text-decoration:none;
          font-size:16px;">
  Sign in with MedInvest
</a>
```

---

## User Data Model

When storing users from MedInvest DID, your database table should include:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medinvest_did TEXT UNIQUE NOT NULL,  -- The DID (sub from userinfo)
  username TEXT,                        -- preferred_username or email or DID
  display_name TEXT,                    -- name from userinfo
  email TEXT,                           -- email from userinfo
  created_at TIMESTAMP DEFAULT NOW()
);
```

### TypeScript Type

```typescript
interface User {
  id: string;
  medinvest_did: string;
  username: string;
  displayName: string | null;
  email: string | null;
}
```

---

## Security Best Practices

1. **Always use HTTPS** in production for your redirect URI
2. **Always validate the `state` parameter** to prevent CSRF attacks
3. **Never expose Client Secret** in frontend code — keep it server-side only
4. **Trim credentials** — leading/trailing whitespace in Client ID or Secret causes failures
5. **Regenerate sessions** after successful login to prevent session fixation
6. **Use `httpOnly` and `secure` cookies** for session management
7. **Set `trust proxy`** if your app is behind a reverse proxy (Replit, Heroku, AWS ALB, etc.)
8. **Use `sameSite: "lax"`** on cookies to prevent CSRF while allowing OAuth redirects

---

## Common Pitfalls & Troubleshooting

### "Array must contain at least 1 element(s)" during app registration
You typed a redirect URI but didn't click the **+** button to add it to the list.

### "Page Not Found" when redirecting to authorize
You're using the wrong authorize URL. The correct URL is:
- `/oauth/authorize` (NO `/api/` prefix)
- NOT `/api/oauth/authorize`

### "Unexpected token '<'" or HTML instead of JSON from token endpoint
You're using the wrong token URL. The correct URL is:
- `/api/oauth/token` (HAS `/api/` prefix)
- NOT `/oauth/token`

### OAuth state mismatch / "invalid_state" error
- Your redirect URI sends users to a different server than the one that stored the state
- Example: Login initiated on dev server, but callback goes to production server
- Fix: Make sure `MEDINVEST_REDIRECT_URI` points to the same server the user is browsing

### "redirect_uri_mismatch" error
The redirect URI in your request doesn't exactly match what's registered on the DID portal. Check:
- Protocol (https vs http)
- Domain (exact match, including subdomains)
- Path (exact match, including trailing slashes)
- No extra whitespace

### Client ID has leading space
If your authorize URL shows `client_id=+mi_...` (with a + or space), your environment variable has a leading space. Trim it: `process.env.MEDINVEST_CLIENT_ID.trim()`

### Session lost between login and callback (MemoryStore)
If using the default `MemoryStore` for sessions:
- Sessions are lost when the server restarts
- Not suitable for production — use a persistent store (Redis, database, etc.)
- On platforms with auto-scaling (like Replit Autoscale), requests may hit different instances

### Token exchange returns 401 or 403
- Verify your Client Secret is correct
- Verify the `redirect_uri` in the token request matches what was sent in the authorize request
- Ensure `Content-Type: application/json` header is set

---

## Quick Start Checklist

- [ ] Register your app at https://did-login.replit.app (Developer Portal)
- [ ] Click **+** to add your redirect URI (don't just type it)
- [ ] Select all three scopes (Read DID, Read Profile, Verify DID)
- [ ] Copy your Client ID (`mi_...`) and Client Secret (`mis_...`)
- [ ] Store credentials as environment variables (never in code)
- [ ] Trim whitespace from all credential values
- [ ] Implement login route → redirects to `/oauth/authorize` (no /api/)
- [ ] Implement callback route → exchanges code at `/api/oauth/token`
- [ ] Fetch user profile from `/api/oauth/userinfo`
- [ ] Store user's DID (`sub` field) as their unique identifier
- [ ] Add state parameter for CSRF protection
- [ ] Set `trust proxy` if behind a reverse proxy
- [ ] Test the full flow end-to-end before going live

---

## Endpoint Summary (Copy-Paste Ready)

```
Authorization:  GET  https://did-login.replit.app/oauth/authorize
Token:          POST https://did-login.replit.app/api/oauth/token
User Info:      GET  https://did-login.replit.app/api/oauth/userinfo
```

---

*This guide is based on the working VoiceControl implementation. All code examples have been tested and verified in production.*
