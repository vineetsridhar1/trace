import { Router, type Router as RouterType, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/db.js";
import { createBridgeAuthToken, getRequestToken, verifyToken } from "../lib/auth.js";

const router: RouterType = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";
const WEB_URL = process.env.TRACE_WEB_URL || `http://localhost:${3000 + Number(process.env.TRACE_PORT || 0)}`;
const SERVER_PUBLIC_URL = process.env.TRACE_SERVER_PUBLIC_URL || WEB_URL;
const GITHUB_CALLBACK_URL = `${SERVER_PUBLIC_URL.replace(/\/$/, "")}/auth/github/callback`;

// Redirect to GitHub OAuth
router.get("/auth/github", (req: Request, res: Response) => {
  const origin = req.query.origin as string | undefined;
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: "read:user user:email",
  });
  if (origin) {
    params.set("state", origin);
  }
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GitHub OAuth callback
router.get("/auth/github/callback", async (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Missing code parameter" });
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL,
      }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };

    if (!tokenData.access_token) {
      return res.status(400).json({ error: "Failed to get access token" });
    }

    // Fetch GitHub user profile
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const ghUser = (await userRes.json()) as {
      id: number;
      login: string;
      email: string | null;
      avatar_url: string;
      name: string | null;
    };

    // Fetch primary email if not public
    let email = ghUser.email;
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const emails = (await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary = emails.find((e) => e.primary && e.verified);
      email = primary?.email ?? emails[0]?.email ?? null;
    }

    if (!email) {
      return res.status(400).json({ error: "Could not retrieve email from GitHub" });
    }

    // Upsert user - find by githubId first, then by email
    let user = await prisma.user.findFirst({
      where: { OR: [{ githubId: ghUser.id }, { email }] },
    });

    if (user) {
      // Update GitHub fields
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubId: ghUser.id,
          avatarUrl: ghUser.avatar_url,
          name: ghUser.name || ghUser.login,
        },
      });
    } else {
      // New user — create account without any org membership.
      // Users must be explicitly invited to an organization.
      user = await prisma.user.create({
        data: {
          email,
          name: ghUser.name || ghUser.login,
          githubId: ghUser.id,
          avatarUrl: ghUser.avatar_url,
        },
      });
    }

    // Issue JWT (only userId — org is selected via header)
    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.cookie("trace_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });

    // Use origin from OAuth state param if available, otherwise fall back to WEB_URL
    const redirectOrigin = (req.query.state as string) || WEB_URL;

    // Signal the opener window and close the popup
    res.send(`<!DOCTYPE html><html><body><script>
      if (window.opener) {
        window.opener.postMessage({ type: "auth:success", token: "${token}" }, "${redirectOrigin}");
        window.close();
      } else {
        window.location.href = "${redirectOrigin}";
      }
    </script></body></html>`);
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    const errorOrigin = (req.query.state as string) || WEB_URL;
    res.send(`<!DOCTYPE html><html><body><script>
      if (window.opener) {
        window.opener.postMessage({ type: "auth:error" }, "${errorOrigin}");
        window.close();
      } else {
        document.body.textContent = "Authentication failed";
      }
    </script></body></html>`);
  }
});

// Get current user with org memberships
router.get("/auth/me", async (req: Request, res: Response) => {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Invalid token" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        orgMemberships: {
          select: {
            organizationId: true,
            role: true,
            joinedAt: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    res.json({ user });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

router.get("/auth/bridge-token", async (req: Request, res: Response) => {
  const token = getRequestToken(req);
  const userId = token ? verifyToken(token) : null;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const rawOrgId = req.headers["x-organization-id"];
  const organizationId = Array.isArray(rawOrgId) ? rawOrgId[0] : rawOrgId;
  if (typeof organizationId !== "string" || !organizationId.trim()) {
    return res.status(400).json({ error: "Missing X-Organization-Id header" });
  }

  const instanceId = typeof req.query.instanceId === "string" ? req.query.instanceId.trim() : "";
  if (!instanceId) {
    return res.status(400).json({ error: "instanceId is required" });
  }

  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { userId: true },
  });
  if (!membership) {
    return res.status(403).json({ error: "Not a member of this organization" });
  }

  const bridgeToken = createBridgeAuthToken({ userId, organizationId, instanceId });
  res.json({
    token: bridgeToken.token,
    expiresAt: bridgeToken.expiresAt.toISOString(),
  });
});

// Logout
router.post("/auth/logout", (_req: Request, res: Response) => {
  res.clearCookie("trace_token", {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.json({ ok: true });
});

export { router as authRouter };
