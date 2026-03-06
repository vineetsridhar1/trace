import { Router } from 'express';
import { config } from '../config';
import {
  exchangeGitHubCode,
  fetchGitHubUser,
  upsertGitHubUser,
  generateJwt,
} from '../services/authService';

const router = Router();

// Redirect to GitHub OAuth authorize page (desktop app)
router.get('/github', (_req, res) => {
  const params = new URLSearchParams({
    client_id: config.githubClientId,
    scope: 'user:email,repo',
    state: 'desktop',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

// Redirect to GitHub OAuth authorize page (web app)
router.get('/github/web', (_req, res) => {
  const params = new URLSearchParams({
    client_id: config.githubClientId,
    scope: 'user:email,repo',
    state: 'web',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

// Unified GitHub OAuth callback for both desktop and web
router.get('/github/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  if (!code) {
    res.status(400).send('Missing code parameter');
    return;
  }

  try {
    const accessToken = await exchangeGitHubCode(code);
    const githubUser = await fetchGitHubUser(accessToken);
    const user = await upsertGitHubUser(githubUser, accessToken);
    const token = generateJwt(user);

    if (state === 'web') {
      const userJson = encodeURIComponent(
        JSON.stringify({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }),
      );
      res.redirect(`${config.webAppUrl}/auth/callback#token=${token}&user=${userJson}`);
    } else {
      // Desktop flow — render HTML page for Electron to extract the token
      res.send(`<!DOCTYPE html>
<html>
<head>
  <meta name="trace-token" content="${token}">
  <meta name="trace-user" content='${JSON.stringify({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, githubUsername: user.githubUsername })}'>
  <title>Login Successful</title>
</head>
<body>
  <p>Login successful! You can close this window.</p>
</body>
</html>`);
    }
  } catch (err) {
    console.error('GitHub OAuth error:', err);
    if (state === 'web') {
      res.redirect(`${config.webAppUrl}/login?error=auth_failed`);
    } else {
      res.status(500).send('Authentication failed');
    }
  }
});

export default router;
