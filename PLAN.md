# Plan: Channel Run Script & Port Allocation

## Summary

Rename "creation script" to "setup script", rename "startup scripts" to "run script" (single block), add admin-set channel defaults vs user overrides, allocate 10 ports per workspace on creation, and add AI script suggestion.

---

## 1. Database Schema Changes

### Add default script fields to Channel model

**File:** `server/prisma/schema.prisma` — Channel model

Add these fields:
```
defaultRepoPath    String?  @map("default_repo_path")
defaultSetupScript String?  @map("default_setup_script")
defaultRunScript   String?  @map("default_run_script")
```

These are the **admin-set channel defaults** shared across all users.

**Migration:** New migration `add_channel_default_scripts`

### GraphQL Schema

**File:** `server/src/schema/channel/schema.graphql`

- Add `defaultRepoPath`, `defaultSetupScript`, `defaultRunScript` to `Channel` type
- Add these fields to `createChannel` and `updateChannel` mutations
- Add new query: `suggestScripts(localRepoPath: String!): ScriptSuggestion!`
- Add `ScriptSuggestion` type with `setupScript: String`, `runScript: String`

---

## 2. Rename Creation Script -> Setup Script, Startup Scripts -> Run Script

### Local config changes

**File:** `src/main/localConfig.ts` — `LocalChannelConfig` interface

Change from:
```ts
{ localRepoPath, creationScript?, startupScripts?: {name, command}[] }
```
To:
```ts
{ localRepoPath, setupScript?, runScript?, systemInstructions? }
```

- `setupScript` replaces `creationScript` (runs once on worktree creation)
- `runScript` replaces `startupScripts` (single script block, runs servers with port env vars)
- Add migration logic to convert old format on read

**File:** `src/types.ts` — `LocalChannelConfig` and `Channel` interfaces

- Rename `creationScript` to `setupScript` in both
- Remove `startupScripts` from local config
- Add `runScript` field
- Add `defaultRepoPath`, `defaultSetupScript`, `defaultRunScript` to Channel

### All references to update

- `src/context/ChannelContext.tsx` — enrichment logic: merge `setupScript` instead of `creationScript`
- `src/App.tsx` — `getCreationCommands` to `getSetupCommands`, update `handleRunStartupScripts` and `handleRunMessageScripts` to use single `runScript`
- `src/hooks/useClaudeMessageActions.ts` — `getCreationCommands` to `getSetupCommands`
- `src/main/claude.ts` — rename `runCreationScripts` to `runSetupScripts`, update log messages

---

## 3. Port Allocation on Workspace Creation

Currently ports are only allocated when the user clicks "Run Scripts". Change: **allocate 10 ports automatically when spawning a new workspace**.

**File:** `src/hooks/useClaudeMessageActions.ts` — `runPendingMessage`

Before spawning, allocate 10 ports:
```ts
const portResult = await window.traceAPI.allocatePorts(messageId, 10);
```

Inject port info into the system instructions so the run script and Claude know about them.

**File:** `src/App.tsx` — `handleRunMessageScripts`

Simplify to use single `runScript`. Run the single script in one terminal tab with all port env vars.

---

## 4. Channel Settings UI — Admin Defaults vs User Settings

**File:** `src/components/ChannelSettingsModal.tsx` — Redesign

Split into two clearly labeled sections:

### Section 1: "Channel Defaults" (admin-only)
- **Base Branch** — existing field, moved here
- **Default Repo Path** — optional text input
- **Default Setup Script** — textarea (runs once on workspace creation)
- **Default Run Script** — textarea (runs servers with `$PORT`, `$TRACE_PORT_0`, etc.)
- **"Suggest Scripts" button** — calls AI to analyze repo and pre-fill
- These fields are **disabled/read-only for non-admin users** with a note like "Only channel admins can change defaults"
- Saved to the database via `updateChannel` mutation

### Section 2: "My Settings" (per-user overrides)
- **Local Repo Path** — folder picker (existing)
- **Setup Script** — textarea, placeholder shows channel default, empty means "use default"
- **Run Script** — textarea, placeholder shows channel default, empty means "use default"
- **System Instructions** — textarea (existing)
- Saved to local config

### Admin detection
- For now hardcode `isAdmin = true` since auth/membership isn't fully wired yet
- When membership is ready, check `ChannelMember.role === 'admin'`

---

## 5. Create Channel Modal — Admin Sets Defaults

**File:** `src/components/CreateChannelModal.tsx`

After repo is selected and validated, show:
- **Default Setup Script** — textarea
- **Default Run Script** — textarea
- **"Suggest Scripts" button** — calls `suggestScripts` query
- Save these to the channel via the `createChannel` mutation (new fields)

---

## 6. AI Script Suggestion

### Server-side resolver

**File:** `server/src/schema/channel/resolvers/Query/suggestScripts.ts` (new)

Reads the repo's package.json, Makefile, docker-compose.yml, Cargo.toml, go.mod, requirements.txt, etc. and returns suggested scripts:

- If `package.json` with scripts.dev -> setup: `npm install`, run: `npm run dev -- --port $PORT`
- If `package.json` with scripts.start -> run: `PORT=$PORT npm start`
- If `docker-compose.yml` -> run: `docker compose up`
- If Python project -> setup: `pip install -r requirements.txt`
- If Go -> setup: `go mod download`, run: `go run . --port $PORT`

### Client-side

Both `CreateChannelModal` and `ChannelSettingsModal` get a "Suggest Scripts" button.

---

## 7. Run Script Execution

When the user runs scripts on a workspace:
1. Check worktree exists
2. Allocate 10 ports (or reuse existing allocation)
3. Set env vars: `PORT`, `TRACE_BASE_PORT`, `TRACE_PORT_0` through `TRACE_PORT_9`, `REPO_FOLDER`
4. Run the single run script in one terminal tab named "Run Script"

The effective run script is: user's local override if set, otherwise channel default.

---

## 8. Effective Script Resolution

When determining which scripts to use for a workspace:

```
effectiveSetupScript = user.setupScript ?? channel.defaultSetupScript ?? ""
effectiveRunScript = user.runScript ?? channel.defaultRunScript ?? ""
effectiveRepoPath = user.localRepoPath (always user-set, required)
```

This happens in `ChannelContext.tsx` enrichment.

---

## File Change Summary

| File | Change |
|------|--------|
| `server/prisma/schema.prisma` | Add 3 default fields to Channel |
| New migration SQL | Add columns |
| `server/src/schema/channel/schema.graphql` | Add fields, ScriptSuggestion type, suggestScripts query |
| `server/src/schema/channel/resolvers/...` | Update create/update, add suggestScripts |
| `server/src/services/channelService.ts` | Accept new fields |
| `src/types.ts` | Rename creationScript, add runScript, add channel default fields |
| `src/main/localConfig.ts` | Update interface + old format migration |
| `src/components/ChannelSettingsModal.tsx` | Redesign with admin/user sections |
| `src/components/CreateChannelModal.tsx` | Add default scripts + AI suggestion |
| `src/context/ChannelContext.tsx` | Update enrichment |
| `src/App.tsx` | Update script handling, port allocation |
| `src/hooks/useClaudeMessageActions.ts` | Rename, add port allocation |
| `src/hooks/useStartupTerminals.ts` | Simplify for single run script |
| `src/main/claude.ts` | Rename creation to setup |
