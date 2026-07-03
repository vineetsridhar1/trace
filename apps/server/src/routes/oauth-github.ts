import { Router, type Router as RouterType, type Request, type Response } from "express";
import {
  autoJoinOrganizationIfMember,
  exchangeGitHubWebCode,
  upsertUserFromGitHubAccessToken,
} from "../services/github-auth.js";
import { githubCallbackUrl } from "../lib/oauth/config.js";
import { resolveOrganizationForUser } from "../lib/oauth/provider.js";
import {
  consumePendingAuthorization,
  generateAuthorizationCode,
  saveAuthorizationCode,
  type PendingAuthorization,
} from "../lib/oauth/store.js";

function redirectWithError(
  res: Response,
  pending: PendingAuthorization,
  error: string,
  description: string,
): void {
  const url = new URL(pending.redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (pending.clientState) url.searchParams.set("state", pending.clientState);
  res.redirect(url.toString());
}

/**
 * GitHub web-flow callback for the MCP OAuth authorization endpoint. GitHub
 * redirects here after the user authorizes; we resolve the Trace user, mint a
 * one-time authorization code, and bounce back to the MCP client's redirect URI.
 */
export function createOAuthGithubRouter(): RouterType {
  const router: RouterType = Router();

  router.get("/oauth/github/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";

    const pending = state ? await consumePendingAuthorization(state) : null;
    if (!pending) {
      res
        .status(400)
        .type("html")
        .send("<h1>Sign-in expired</h1><p>Start the connection from your MCP client again.</p>");
      return;
    }

    if (!code) {
      redirectWithError(res, pending, "access_denied", "GitHub did not return an authorization code");
      return;
    }

    let githubToken: string;
    try {
      const payload = await exchangeGitHubWebCode(code, githubCallbackUrl());
      if (!payload.access_token) {
        redirectWithError(res, pending, "access_denied", payload.error ?? "GitHub sign-in failed");
        return;
      }
      githubToken = payload.access_token;
    } catch (error) {
      redirectWithError(res, pending, "server_error", (error as Error).message);
      return;
    }

    let userId: string;
    try {
      const user = await upsertUserFromGitHubAccessToken(githubToken);
      userId = user.id;
    } catch {
      redirectWithError(res, pending, "access_denied", "Could not verify your GitHub identity");
      return;
    }

    await autoJoinOrganizationIfMember(userId, githubToken);
    const organizationId = await resolveOrganizationForUser(userId);
    if (!organizationId) {
      redirectWithError(
        res,
        pending,
        "access_denied",
        "Your GitHub account is not a member of the Trace organization",
      );
      return;
    }

    const authorizationCode = generateAuthorizationCode();
    await saveAuthorizationCode(authorizationCode, {
      clientId: pending.clientId,
      userId,
      organizationId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      scopes: pending.scopes,
      ...(pending.resource ? { resource: pending.resource } : {}),
    });

    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set("code", authorizationCode);
    if (pending.clientState) redirect.searchParams.set("state", pending.clientState);
    res.redirect(redirect.toString());
  });

  return router;
}
