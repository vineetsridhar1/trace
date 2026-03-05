import { Router } from 'express';
import { config } from '../config';
import {
  exchangeGitHubCode,
  fetchGitHubUser,
  upsertGitHubUser,
  generateJwt,
} from '../services/authService';

const router = Router();

// Redirect to GitHub OAuth authorize page
router.get('/github', (_req, res) => {
  const params = new URLSearchParams({
    client_id: config.githubClientId,
    scope: 'user:email,repo',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

// GitHub OAuth callback
router.get('/github/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send('Missing code parameter');
    return;
  }

  try {
    const accessToken = await exchangeGitHubCode(code);
    const githubUser = await fetchGitHubUser(accessToken);
    const user = await upsertGitHubUser(githubUser, accessToken);
    const token = generateJwt(user);

    // Render a simple HTML page with the JWT embedded in a meta tag.
    // The Electron BrowserWindow will extract this.
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
  } catch (err) {
    console.error('GitHub OAuth error:', err);
    res.status(500).send('Authentication failed');
  }
});

export default router;
