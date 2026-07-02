# Getting Started

A quick guide to setting up Trace after you sign in. Most steps live under
**Settings**; a few are per-machine.

## 1. Link a repository

Go to **Settings → Repositories** and click **Link Repository**.

- **Desktop app:** choose **Link** and pick an existing local git checkout with
  **Choose Folder**, or choose **Create** to start a new local project. Repo name
  and default branch are auto-detected.
- **Web:** fill in **Repository name**, **Default branch**, and an optional
  **Remote URL** (e.g. `git@github.com:org/repo.git`).

Linked repos become available when you create coding channels and start sessions.

### Connect a local path to an existing repo

Repos are shared across the org, but the checkout on your machine is per-computer.
To run local sessions against a repo someone else added (or that you use on a new
machine), open the repo in **Settings → Repositories** and find **Desktop Linking**.
If it shows **Not linked on this computer**, click **Link Local Path** and choose
your local checkout. Once linked you can **Enable Hooks** to keep branch and
commit state in sync.

## 2. Join or create channels

Use the **+** button at the top of the sidebar, or open **Browse Channels** from
the sidebar menu.

- **Browse Channels** lists every channel in the org. Click **Join** on any you
  want to follow (**Leave** to drop out).
- **Create New** lets you make a **Project** (a channel for messaging or coding
  sessions) or a **Project Group** to organize projects. For a coding project,
  pick a **Repository** and **Base branch**, and set **Visibility** to Public or
  Private.

## 3. Install the coding tools

For local (desktop) sessions, the coding tool must be installed on your machine.
Trace supports Claude Code, Codex, Cursor Composer, and others.

Install the tool you plan to use, for example:

```bash
npm install -g @anthropic-ai/claude-code   # Claude Code
npm install -g @openai/codex               # Codex
```

If you start a session and the tool is missing, Trace shows an
**"… isn't installed"** prompt with the exact install command and a docs link.
Set your preferred tool under **Settings → Session Defaults**.

## 4. Set up your GitHub key

Go to **Settings → API Keys** and add your **GitHub** token. It is used for cloud
containers, repository files, diffs, and webhooks.

- Paste a GitHub personal access token (starts with `ghp_`) and **Save**.
- On the desktop app you can click **Import from CLI** to pull the token from your
  existing `gh auth` login instead.

Tokens are encrypted and show as **Configured** once saved.

## 5. Set up the mobile app

Pairing is done with a one-time QR code generated from your signed-in web or
desktop session.

1. On web/desktop, open **Settings → Mobile Pairing** and click **Generate QR**.
   (For a local instance, first enter a **Reachable Trace URL** your phone can
   hit, e.g. `http://192.168.1.20:3000`.)
2. In the mobile app, tap **Pair with Trace → Scan a pairing code** and scan the
   QR, or paste the pairing JSON with **Paste from clipboard**.

Codes expire after 5 minutes and can be used once. Paired devices appear in the
**Mobile Pairing** section, where you can revoke them later.

## Next steps

- Start a session on a linked repo from a coding channel.
- Follow status, files, terminals, and checkpoints from web, desktop, or mobile.
- See [Running Trace](running-trace.md) for self-hosting and deployment.
</content>
</invoke>
