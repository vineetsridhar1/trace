import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../lib/prisma';

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

export async function exchangeGitHubCode(code: string): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
    }),
  });

  const data = (await response.json()) as GitHubTokenResponse & { error?: string; error_description?: string };
  if (!data.access_token) {
    console.error('[OAuth] Token exchange failed:', data.error, data.error_description);
    throw new Error(`Failed to exchange GitHub code: ${data.error_description || data.error || 'unknown'}`);
  }
  return data.access_token;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    console.error('[OAuth] GitHub user fetch failed:', response.status, body);
  }

  if (!response.ok) {
    throw new Error('Failed to fetch GitHub user profile');
  }

  const user = (await response.json()) as GitHubUser;

  // If email is not public, fetch from /user/emails
  if (!user.email) {
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (emailsResponse.ok) {
      const emails = (await emailsResponse.json()) as GitHubEmail[];
      const primary = emails.find((e) => e.primary && e.verified);
      if (primary) {
        user.email = primary.email;
      }
    }
  }

  return user;
}

export async function upsertGitHubUser(githubUser: GitHubUser, accessToken: string) {
  const githubId = String(githubUser.id);
  const email = githubUser.email || `${githubUser.login}@github.local`;
  const name = githubUser.name || githubUser.login;

  const user = await prisma.user.upsert({
    where: { githubId },
    update: {
      name,
      email,
      avatarUrl: githubUser.avatar_url,
      githubAccessToken: accessToken,
      githubUsername: githubUser.login,
    },
    create: {
      githubId,
      email,
      name,
      avatarUrl: githubUser.avatar_url,
      githubAccessToken: accessToken,
      githubUsername: githubUser.login,
      role: 'member',
    },
  });

  return user;
}

export function generateJwt(user: { id: string; email: string }): string {
  return jwt.sign({ userId: user.id, email: user.email } satisfies JwtPayload, config.jwtSecret, {
    expiresIn: '30d',
  });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}
