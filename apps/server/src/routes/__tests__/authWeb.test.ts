import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../lib/prisma', () => ({ default: {} }));
vi.mock('../../services/authService');
vi.mock('../../config', () => ({
  config: {
    githubClientId: 'test-client-id',
    githubClientSecret: 'test-client-secret',
    webAppUrl: 'https://app.example.com',
    githubWebCallbackUrl: 'http://localhost:3100/auth/github/callback/web',
  },
}));

import {
  exchangeGitHubCode,
  fetchGitHubUser,
  upsertGitHubUser,
  generateJwt,
} from '../../services/authService';
import authRouter from '../auth';

const mockedExchangeGitHubCode = exchangeGitHubCode as MockedFunction<typeof exchangeGitHubCode>;
const mockedFetchGitHubUser = fetchGitHubUser as MockedFunction<typeof fetchGitHubUser>;
const mockedUpsertGitHubUser = upsertGitHubUser as MockedFunction<typeof upsertGitHubUser>;
const mockedGenerateJwt = generateJwt as MockedFunction<typeof generateJwt>;

function createApp() {
  const app = express();
  app.use('/auth', authRouter);
  return app;
}

describe('GET /auth/github/callback/web', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 400 when code param is missing', async () => {
    const res = await request(createApp()).get('/auth/github/callback/web');
    expect(res.status).toBe(400);
    expect(res.text).toContain('Missing code');
  });

  it('redirects to web app with token in fragment on successful exchange', async () => {
    mockedExchangeGitHubCode.mockResolvedValue('gh-access-token');
    mockedFetchGitHubUser.mockResolvedValue({
      id: 42,
      login: 'testuser',
      name: 'Test User',
      email: 'test@example.com',
      avatar_url: 'https://avatars.example.com/42',
    });
    mockedUpsertGitHubUser.mockResolvedValue({
      id: 'user-uuid-1',
      email: 'test@example.com',
      name: 'Test User',
      avatarUrl: 'https://avatars.example.com/42',
    } as any);
    mockedGenerateJwt.mockReturnValue('jwt-token-123');

    const res = await request(createApp()).get('/auth/github/callback/web?code=abc123');

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('https://app.example.com/auth/callback#token=jwt-token-123');
  });

  it('uses a # fragment (not query string) for the token', async () => {
    mockedExchangeGitHubCode.mockResolvedValue('gh-access-token');
    mockedFetchGitHubUser.mockResolvedValue({
      id: 1,
      login: 'u',
      name: 'U',
      email: 'u@e.com',
      avatar_url: 'https://a.com/1',
    });
    mockedUpsertGitHubUser.mockResolvedValue({
      id: 'uid',
      email: 'u@e.com',
      name: 'U',
      avatarUrl: 'https://a.com/1',
    } as any);
    mockedGenerateJwt.mockReturnValue('tok');

    const res = await request(createApp()).get('/auth/github/callback/web?code=x');
    const location = res.headers.location as string;

    // The path before the fragment must NOT contain ?token=
    const [pathPart, fragment] = location.split('#');
    expect(pathPart).not.toContain('token=');
    expect(fragment).toMatch(/^token=/);
  });

  it('encodes the user JSON with encodeURIComponent', async () => {
    mockedExchangeGitHubCode.mockResolvedValue('tok');
    mockedFetchGitHubUser.mockResolvedValue({
      id: 7,
      login: 'fancy',
      name: 'Fancy & "User"',
      email: 'fancy@test.com',
      avatar_url: 'https://a.com/7',
    });
    mockedUpsertGitHubUser.mockResolvedValue({
      id: 'uid-7',
      email: 'fancy@test.com',
      name: 'Fancy & "User"',
      avatarUrl: 'https://a.com/7',
    } as any);
    mockedGenerateJwt.mockReturnValue('jwt');

    const res = await request(createApp()).get('/auth/github/callback/web?code=c');
    const location = res.headers.location as string;
    const fragment = location.split('#')[1];
    const params = new URLSearchParams(fragment);
    const userJson = params.get('user')!;

    // Should be a valid JSON string after decoding
    const parsed = JSON.parse(userJson);
    expect(parsed).toEqual({
      id: 'uid-7',
      email: 'fancy@test.com',
      name: 'Fancy & "User"',
      avatarUrl: 'https://a.com/7',
    });
  });

  it('redirects to login with error when exchangeGitHubCode throws', async () => {
    mockedExchangeGitHubCode.mockRejectedValue(new Error('GitHub is down'));

    const res = await request(createApp()).get('/auth/github/callback/web?code=bad');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://app.example.com/login?error=auth_failed');
  });
});
