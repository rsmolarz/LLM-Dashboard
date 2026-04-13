import * as oidc from "openid-client";
import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const MEDINVEST_BASE = "https://did-login.replit.app";
const MEDINVEST_AUTHORIZE_URL = `${MEDINVEST_BASE}/api/oauth/authorize`;
const MEDINVEST_TOKEN_URL = `${MEDINVEST_BASE}/api/oauth/token`;
const MEDINVEST_USERINFO_URL = `${MEDINVEST_BASE}/api/oauth/userinfo`;
const MEDINVEST_CLIENT_ID = process.env.MEDINVEST_CLIENT_ID || "";
const MEDINVEST_CLIENT_SECRET = process.env.MEDINVEST_CLIENT_SECRET || "";

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

async function upsertUser(claims: Record<string, unknown>) {
  const userData = {
    id: claims.sub as string,
    email: (claims.email as string) || null,
    firstName: (claims.first_name as string) || (claims.given_name as string) || (claims.name as string)?.split(" ")[0] || null,
    lastName: (claims.last_name as string) || (claims.family_name as string) || (claims.name as string)?.split(" ").slice(1).join(" ") || null,
    profileImageUrl: (claims.profile_image_url || claims.picture || claims.avatar) as
      | string
      | null,
  };

  const existing = await db.select().from(usersTable).where(eq(usersTable.id, userData.id)).limit(1);
  const isNewUser = existing.length === 0;

  let assignRole: string | undefined;
  if (isNewUser) {
    const allUsers = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (allUsers.length === 0) {
      assignRole = "admin";
    }
  }

  const [user] = await db
    .insert(usersTable)
    .values({ ...userData, ...(assignRole ? { role: assignRole } : {}) })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        ...userData,
        updatedAt: new Date(),
      },
    })
    .returning();
  return user;
}

router.get("/auth/user", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    res.json({ user: null });
    return;
  }
  const userId = (req.user as any).id;
  if (userId) {
    const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, String(userId))).limit(1);
    if (freshUser) {
      const merged = {
        ...(req.user as any),
        role: freshUser.role || "user",
      };
      res.json({ user: merged });
      return;
    }
  }
  res.json({ user: req.user });
});

router.get("/login", async (req: Request, res: Response) => {
  const origin = getOrigin(req);
  const callbackUrl = `${origin}/api/callback`;
  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = crypto.randomBytes(20).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

  setOidcCookie(res, "mi_code_verifier", codeVerifier);
  setOidcCookie(res, "mi_state", state);
  setOidcCookie(res, "mi_return_to", returnTo);

  const params = new URLSearchParams({
    client_id: MEDINVEST_CLIENT_ID,
    response_type: "code",
    redirect_uri: callbackUrl,
    scope: "openid profile email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  res.redirect(`${MEDINVEST_AUTHORIZE_URL}?${params.toString()}`);
});

router.get("/callback", async (req: Request, res: Response) => {
  const origin = getOrigin(req);
  const callbackUrl = `${origin}/api/callback`;

  const code = req.query.code as string;
  const state = req.query.state as string;
  const error = req.query.error as string;

  if (error) {
    console.error("[medinvest-auth] OAuth error:", error, req.query.error_description);
    res.redirect("/?auth_error=" + encodeURIComponent(error));
    return;
  }

  const expectedState = req.cookies?.mi_state;
  const codeVerifier = req.cookies?.mi_code_verifier;
  const returnTo = getSafeReturnTo(req.cookies?.mi_return_to);

  if (!code || !state || state !== expectedState) {
    console.error("[medinvest-auth] State mismatch or missing code");
    res.redirect("/api/login");
    return;
  }

  res.clearCookie("mi_code_verifier", { path: "/" });
  res.clearCookie("mi_state", { path: "/" });
  res.clearCookie("mi_return_to", { path: "/" });

  try {
    const tokenBody: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      client_id: MEDINVEST_CLIENT_ID,
      client_secret: MEDINVEST_CLIENT_SECRET,
    };
    if (codeVerifier) {
      tokenBody.code_verifier = codeVerifier;
    }

    const tokenRes = await fetch(MEDINVEST_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenBody).toString(),
      signal: AbortSignal.timeout(15000),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[medinvest-auth] Token exchange failed:", tokenRes.status, errBody);
      res.redirect("/?auth_error=token_exchange_failed");
      return;
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error("[medinvest-auth] No access_token in response");
      res.redirect("/?auth_error=no_access_token");
      return;
    }

    let userClaims: Record<string, unknown> = {};

    if (tokenData.id_token) {
      try {
        const parts = tokenData.id_token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
          userClaims = payload;
        }
      } catch (e) {
        console.error("[medinvest-auth] Failed to decode id_token:", e);
      }
    }

    if (!userClaims.sub || !userClaims.email) {
      try {
        const uiRes = await fetch(MEDINVEST_USERINFO_URL, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10000),
        });
        if (uiRes.ok) {
          const uiData: any = await uiRes.json();
          userClaims = { ...userClaims, ...uiData };
        }
      } catch (e) {
        console.error("[medinvest-auth] Userinfo fetch failed:", e);
      }
    }

    if (!userClaims.sub) {
      userClaims.sub = (userClaims.id as string) || (userClaims.user_id as string) || `mi_${crypto.randomBytes(16).toString("hex")}`;
    }

    const dbUser = await upsertUser(userClaims);

    const now = Math.floor(Date.now() / 1000);
    const sessionData: SessionData = {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        profileImageUrl: dbUser.profileImageUrl,
        role: (dbUser as any).role || "user",
      },
      access_token: accessToken,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_in ? now + tokenData.expires_in : now + 3600,
    };

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
    res.redirect(returnTo);
  } catch (err: any) {
    console.error("[medinvest-auth] Callback error:", err);
    res.redirect("/?auth_error=callback_failed");
  }
});

router.get("/logout", async (req: Request, res: Response) => {
  const origin = getOrigin(req);
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect(origin);
});

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const { code, code_verifier, redirect_uri, state } = req.body || {};
    if (!code || !redirect_uri) {
      res.status(400).json({ error: "Missing required parameters" });
      return;
    }

    try {
      const tokenBody: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri,
        client_id: MEDINVEST_CLIENT_ID,
        client_secret: MEDINVEST_CLIENT_SECRET,
      };
      if (code_verifier) tokenBody.code_verifier = code_verifier;

      const tokenRes = await fetch(MEDINVEST_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(tokenBody).toString(),
        signal: AbortSignal.timeout(15000),
      });

      if (!tokenRes.ok) {
        res.status(401).json({ error: "Token exchange failed" });
        return;
      }

      const tokenData: any = await tokenRes.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        res.status(401).json({ error: "No access token" });
        return;
      }

      let userClaims: Record<string, unknown> = {};
      if (tokenData.id_token) {
        try {
          const parts = tokenData.id_token.split(".");
          if (parts.length === 3) {
            userClaims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
          }
        } catch {}
      }

      if (!userClaims.sub || !userClaims.email) {
        const uiRes = await fetch(MEDINVEST_USERINFO_URL, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10000),
        });
        if (uiRes.ok) {
          const uiData: any = await uiRes.json();
          userClaims = { ...userClaims, ...uiData };
        }
      }

      if (!userClaims.sub) {
        userClaims.sub = (userClaims.id as string) || `mi_${crypto.randomBytes(16).toString("hex")}`;
      }

      const dbUser = await upsertUser(userClaims);
      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
          role: (dbUser as any).role || "user",
        },
        access_token: accessToken,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_in ? now + tokenData.expires_in : now + 3600,
      };

      const sid = await createSession(sessionData);
      res.json({ token: sid });
    } catch (err) {
      console.error("Mobile token exchange error:", err);
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json({ success: true });
});

router.get("/auth/users", async (req: Request, res: Response) => {
  if (!req.user || (req.user as any).role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    profileImageUrl: usersTable.profileImageUrl,
    role: usersTable.role,
    createdAt: usersTable.createdAt,
  }).from(usersTable);
  res.json(users);
});

router.put("/auth/users/:userId/role", async (req: Request, res: Response) => {
  if (!req.user || (req.user as any).role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const { role } = req.body;
  if (!role || !["admin", "user"].includes(role)) {
    res.status(400).json({ error: "Role must be 'admin' or 'user'" });
    return;
  }
  const [updated] = await db.update(usersTable)
    .set({ role })
    .where(eq(usersTable.id, req.params.userId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ id: updated.id, email: updated.email, role: updated.role });
});

export default router;
