# Slash Commands for Claude Code Sessions

## Overview

Add slash command autocomplete to Claude Code sessions. When a user types `/` in the session input, a popover appears above the textarea showing available commands from three sources: user skills (local bridge), project skills (repo), and built-in Claude Code commands. Only enabled when `tool === "claude_code"`.

---

## Command Sources & Behavior

### 1. User-Level Skills (`~/.claude/skills/<name>/SKILL.md`)
- Discovered via new `list_skills` bridge command
- Only available on **local bridges** (not cloud, not another user's bridge)
- On selection: send `/<skill-name>` as a regular text message to the session

### 2. Project-Level Skills (`.claude/skills/<name>/SKILL.md`)
- Discovered via the same `list_skills` bridge command (scans session workdir)
- Available on **all bridges** (repo is cloned in both local and cloud)
- On selection: send `/<skill-name>` as a regular text message

### 3. Built-in Claude Code Commands
Three categories:

| Command | Behavior | Availability |
|---------|----------|-------------|
| `/clear` | **Hardcoded**: creates a new session tab (does NOT send to Claude) | All (local action) |
| `/compact` | Send as message; show "Chat compacted" toast on completion | All bridges |
| `/help`, `/review`, `/memory`, `/cost`, `/model` | Send as regular text message | All bridges |
| `/usage`, `/mcp`, `/config`, `/doctor`, `/login`, `/logout`, `/init`, `/permissions`, `/status`, `/terminal`, `/vim` | Open terminal, run `claude <command>` | **Local bridge only**, session must be started |

---

## Implementation Steps

### Step 1: Shared Types & Constants

**File: `packages/shared/src/bridge.ts`**
- Add `BridgeListSkillsCommand` (Server → Bridge):
  ```ts
  { type: "list_skills"; requestId: string; sessionId: string; workdirHint?: string }
  ```
- Add `BridgeSkillInfo` type:
  ```ts
  { name: string; description: string; source: "user" | "project" }
  ```
- Add `BridgeSkillsResult` (Bridge → Server):
  ```ts
  { type: "skills_result"; requestId: string; skills: BridgeSkillInfo[]; error?: string }
  ```
- Add both to `BridgeCommand` and `BridgeMessage` unions
- Add shared `handleListSkills()` helper (follows `handleListFiles` pattern) that scans directories and parses SKILL.md frontmatter for name/description

**File: `packages/shared/src/slash-commands.ts`** (new)
- Export `BUILTIN_SLASH_COMMANDS` array with `{ name, description, category }` where category is `"passthrough" | "terminal" | "special"`
- Export `SlashCommandInfo` type used by both server and frontend
- `/clear` has category `"special"`, terminal commands have `"terminal"`, rest have `"passthrough"`

### Step 2: Desktop Bridge Handler

**File: `apps/desktop/src/bridge.ts`**
- Add `case "list_skills"` in the command handler
- Call shared `handleListSkills()` with:
  - User skills dir: `os.homedir() + "/.claude/skills/"`
  - Project skills dir: `sessionWorkdirs.get(sessionId) + "/.claude/skills/"`
- Send `skills_result` response

**File: `apps/container-bridge/src/bridge.ts`** (if it exists)
- Same handler but pass `null` for user skills dir (cloud has no user skills)

### Step 3: Server — Session Router

**File: `apps/server/src/lib/session-router.ts`**
- Add `pendingSkillsRequests` map (same pattern as `pendingFileRequests`)
- Add `listSkills(runtimeId, sessionId, workdirHint?, timeoutMs?)` → `Promise<BridgeSkillInfo[]>`
- Add `resolveSkillsRequest(requestId, skills, error?)` method

**File: `apps/server/src/lib/bridge-handler.ts`**
- Add `skills_result` case that calls `sessionRouter.resolveSkillsRequest()`

### Step 4: GraphQL Schema & Resolver

**File: `packages/gql/src/schema.graphql`**
```graphql
type SlashCommand {
  name: String!
  description: String!
  source: SlashCommandSource!
  category: SlashCommandCategory!
}

enum SlashCommandSource {
  user_skill
  project_skill
  builtin
}

enum SlashCommandCategory {
  passthrough
  terminal
  special
}

extend type Query {
  sessionSlashCommands(sessionId: ID!): [SlashCommand!]!
}
```

**Resolver logic:**
1. Fetch session — if `tool !== "claude_code"`, return `[]`
2. Get runtime for session; determine if local or cloud
3. If runtime connected: call `sessionRouter.listSkills()` to get skills from bridge
4. Merge with built-in commands:
   - Always include `passthrough` and `special` commands
   - Only include `terminal` commands if bridge is local
5. Filter out user skills if bridge is cloud
6. Return merged list

Run `pnpm gql:codegen` after schema changes.

### Step 5: Frontend — Data Hook

**File: `apps/web/src/lib/queries.ts`** (or wherever queries live)
- Add `SESSION_SLASH_COMMANDS_QUERY` GraphQL query

**File: `apps/web/src/components/session/useSlashCommands.ts`** (new)
- Hook takes `sessionId`
- Reads `tool` from entity store — if not `claude_code`, returns empty
- Lazy-fetches `sessionSlashCommands` query (triggered when user types `/`)
- Caches result for the session (refetch on explicit action only)
- Returns `{ commands, loading, fetch }`
- Show built-in commands immediately while bridge skills load asynchronously

### Step 6: Frontend — Autocomplete Popover

**File: `apps/web/src/components/session/SlashCommandMenu.tsx`** (new)
- Popover positioned above the textarea using absolute positioning
- Groups commands by source with section headers: "Built-in", "Project", "User"
- Each row: `/<name>` + description + terminal icon badge if category is `terminal`
- Keyboard nav: Arrow up/down to navigate, Enter/Tab to select, Escape to dismiss
- Filters by prefix as user types after `/`
- Props: `commands`, `filter`, `onSelect`, `onDismiss`, `selectedIndex`

### Step 7: Frontend — Integrate into SessionInput

**File: `apps/web/src/components/session/SessionInput.tsx`**
- Import `useSlashCommands` hook and `SlashCommandMenu`
- Track state: `showSlashMenu`, `slashFilter`, `selectedCommandIndex`
- On `onChange`: if text starts with `/` and cursor is after `/`, show menu and update filter. If text doesn't start with `/`, hide menu.
- On `onKeyDown` (when menu is showing):
  - ArrowUp/ArrowDown: navigate menu items
  - Enter/Tab: select command (prevent default send)
  - Escape: dismiss menu
- On command selection:
  - **`special` (`/clear`)**: Call a function that creates a new session in the same channel (reuse existing "new session" logic). Don't send any message.
  - **`passthrough`**: Set message to `/<name>`, call `handleSend()`
  - **`terminal`**: Create terminal via `CREATE_TERMINAL_MUTATION`, then write `claude /<name>\n` to the terminal socket once connected. Activate the terminal panel.
- Trigger skill fetch on first `/` keystroke (lazy load)

### Step 8: Compact Command — Toast on Completion

**File: `apps/web/src/components/session/SessionInput.tsx`** (or output handler)
- When `/compact` is sent, track that a compact is in progress
- When the session transitions from `active` → `done`/`needs_input` and compact was the last command, show `toast.success("Chat compacted")` via sonner

---

## File Change Summary

| File | Change |
|------|--------|
| `packages/shared/src/bridge.ts` | Add `BridgeListSkillsCommand`, `BridgeSkillsResult`, `BridgeSkillInfo`, `handleListSkills()` |
| `packages/shared/src/slash-commands.ts` | **New**: built-in command definitions, shared types |
| `apps/desktop/src/bridge.ts` | Handle `list_skills` command |
| `apps/container-bridge/src/bridge.ts` | Handle `list_skills` (project skills only) |
| `apps/server/src/lib/session-router.ts` | Add `listSkills()`, `resolveSkillsRequest()`, pending map |
| `apps/server/src/lib/bridge-handler.ts` | Handle `skills_result` message |
| `packages/gql/src/schema.graphql` | Add `SlashCommand`, `SlashCommandSource`, `SlashCommandCategory`, query |
| `apps/server/src/schema/` | Add resolver for `sessionSlashCommands` |
| `apps/web/src/lib/mutations.ts` | Add `SESSION_SLASH_COMMANDS_QUERY` |
| `apps/web/src/components/session/useSlashCommands.ts` | **New**: data fetching hook |
| `apps/web/src/components/session/SlashCommandMenu.tsx` | **New**: autocomplete popover UI |
| `apps/web/src/components/session/SessionInput.tsx` | Integrate slash command menu + handle selection |

---

## Edge Cases

- **Session not started**: Show only built-in passthrough + special commands (no bridge = no skills, no terminal commands). Skills and terminal commands appear once session starts.
- **Bridge disconnected**: `listSkills` fails gracefully → show only built-in commands.
- **Codex sessions**: `tool !== "claude_code"` → slash commands completely disabled, menu never shows.
- **Empty filter**: Show all available commands grouped by source.
- **No matching commands**: Show "No matching commands" in the popover.
- **`/compact` toast**: Only show toast if the last user message was exactly `/compact`. Use a ref to track this.
