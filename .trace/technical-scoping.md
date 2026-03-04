# Technical Scoping — AI Terminal Interaction via MCP

## 1. Architecture Overview

### High-Level Architecture

```
Claude CLI
  │ (spawns via MCP config command/args)
  │ stdio (JSON-RPC / MCP protocol)
  ▼
MCP Server  (.vite/build/mcpServer.js)
  │  --workspace-id <id>
  │  --socket-path /tmp/trace-mcp-<wsId>.sock
  │
  │ Unix domain socket (JSON messages)
  ▼
Electron Main Process
  ├── MCP Bridge Handler (net.Server on Unix socket)
  │     ├── readTerminal  → pty.ts ringBuffer
  │     ├── writeTerminal → pty.ts writePty()
  │     ├── listTerminals → terminalRegistry
  │     └── createTerminal → pty.ts + IPC to renderer
  ├── pty.ts (PTY sessions + ring buffers)
  ├── Terminal Registry (Map<wsId, TerminalTab[]>, synced from renderer)
  └── spawnAgent.ts (lifecycle: socket server start → MCP config → Claude spawn → cleanup)
          │
          │ IPC (webContents.send)
          ▼
Electron Renderer Process
  ├── terminalStore.ts (Zustand — syncs terminal list to main via IPC)
  ├── Terminal.tsx / TerminalTabs.tsx (xterm.js UI)
  └── IPC listeners for mcp-add-terminal events
```

### How This Feature Fits Into the Existing System

The feature bridges two currently isolated systems:
- **Agent system** (`src/main/agents/`): Spawns Claude CLI, parses stream output, posts events to server
- **Terminal system** (`src/main/pty.ts` + `src/stores/terminalStore.ts`): Manages PTY sessions, renders xterm.js UI

The MCP server acts as a sidecar process that Claude spawns via `--mcp-config`. It communicates with the Electron main process via a Unix domain socket, which provides access to PTY read/write operations and terminal metadata.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MCP server ↔ Electron IPC | Unix domain socket | Claude spawns the MCP server (not Trace), so Node `process.send()` is unavailable. Unix sockets are simple, zero port allocation, macOS-native, and scoped to the filesystem. |
| Terminal name → ID resolution | Renderer pushes to main | Event-driven sync keeps main process up-to-date without latency of on-demand queries. Mirrors the existing pattern where renderer drives state and main executes. |
| MCP server bundling | Separate Vite entry point | Produces a standalone `.vite/build/mcpServer.js` that Claude can spawn with `node`. Fits the existing Forge + Vite build pipeline without hacks. |
| `create_terminal` coordination | Main → renderer IPC event | Main process creates the PTY and sends an event to the renderer to update the Zustand store. Renderer registers a listener that calls a new `addTerminalWithId()` action. |
| ANSI stripping | `strip-ansi` npm package | Well-maintained, handles edge cases. Stripping at read time preserves raw data in the ring buffer. |
| MCP SDK | `@modelcontextprotocol/sdk` | Handles JSON-RPC framing, tool schemas, and stdio transport. Avoids hand-rolling protocol logic. |

---

## 2. File-Level Implementation Plan

### Backend — Electron Main Process

| File | Change Type | Description | Complexity |
|------|-------------|-------------|------------|
| `src/main/mcp/ringBuffer.ts` | **New** | Circular character buffer class with `append()` and `readLines()`. O(1) writes via string concatenation + slice. | Small |
| `src/main/mcp/terminalMcpServer.ts` | **New** | Standalone MCP server entry point. Uses `@modelcontextprotocol/sdk` stdio transport. Implements 4 tools: `read_terminal`, `write_terminal`, `list_terminals`, `create_terminal`. Communicates with Electron main via Unix domain socket client. | Large |
| `src/main/mcp/mcpBridge.ts` | **New** | Unix domain socket server in the Electron main process. Receives JSON requests from MCP server, dispatches to PTY operations and terminal registry. One socket server per active workspace agent. | Medium |
| `src/main/mcp/terminalRegistry.ts` | **New** | In-memory `Map<workspaceId, TerminalTab[]>` maintained in the main process. Updated via renderer IPC sync. Provides `resolveTerminalByName(workspaceId, name)` and `listTerminals(workspaceId)`. | Small |
| `src/main/pty.ts` | **Modify** | Add per-PTY ring buffer. Hook into `proc.onData()` to capture output. Add `readPtyBuffer(terminalId, lines)` export. Clean up buffer in `killPty()`. | Medium |
| `src/main/agents/spawnAgent.ts` | **Modify** | Before spawning Claude: start Unix socket server via `mcpBridge`, generate MCP config JSON, pass `--mcp-config` path to agent command. On agent close: clean up socket server + config file. | Medium |
| `src/main/agents/claude.ts` | **Modify** | In `buildCommand()`, add `--mcp-config <path>` to args when `ctx.mcpConfigPath` is set. | Small |
| `src/main/agents/types.ts` | **Modify** | Add `mcpConfigPath?: string` to `AgentSpawnContext` interface. | Small |
| `src/main/ipc.ts` | **Modify** | Register new IPC handlers: `sync-workspace-terminals` (renderer→main terminal sync), `mcp-add-terminal` event setup. Register cleanup for MCP bridge resources. | Small |

### Frontend — Renderer Process

| File | Change Type | Description | Complexity |
|------|-------------|-------------|------------|
| `src/stores/terminalStore.ts` | **Modify** | Add `addTerminalWithId(workspaceId, terminalId, name)` action for MCP-created terminals. Add `syncTerminalsToMain()` side-effect that calls IPC whenever `_allTerminals` changes. | Medium |
| `src/preload.ts` | **Modify** | Expose `syncWorkspaceTerminals()` IPC method and `onMcpAddTerminal()` event listener. | Small |
| `src/types.ts` | **Modify** | Add `syncWorkspaceTerminals` and `onMcpAddTerminal` to `TraceAPI` interface. | Small |

### Build Configuration

| File | Change Type | Description | Complexity |
|------|-------------|-------------|------------|
| `vite.main.config.ts` | **Modify** | Add `mcpServer` as a second Rollup input entry point alongside `main`. External: `@modelcontextprotocol/sdk`, `strip-ansi`. | Small |
| `package.json` | **Modify** | Add `@modelcontextprotocol/sdk` and `strip-ansi` to dependencies. | Small |

---

## 3. Data Model Changes

### New TypeScript Interfaces

```typescript
// src/main/mcp/ringBuffer.ts
export class RingBuffer {
  private buffer: string;
  private readonly maxSize: number;
  constructor(maxSize?: number);       // default 50_000
  append(data: string): void;          // O(1) amortized
  readLines(count: number): string;    // returns last N lines, ANSI-stripped
  clear(): void;
}
```

```typescript
// src/main/mcp/terminalRegistry.ts
import type { TerminalTab } from '../../stores/terminalStore';

// Mirror of renderer's _allTerminals, synced via IPC
const registry = new Map<string, TerminalTab[]>();

export function updateWorkspaceTerminals(workspaceId: string, terminals: TerminalTab[]): void;
export function removeWorkspaceTerminals(workspaceId: string): void;
export function resolveTerminalByName(workspaceId: string, name: string): TerminalTab | undefined;
export function listWorkspaceTerminals(workspaceId: string): TerminalTab[];
```

```typescript
// src/main/mcp/mcpBridge.ts
export interface McpBridgeRequest {
  id: string;
  method: 'readTerminal' | 'writeTerminal' | 'listTerminals' | 'createTerminal';
  params: Record<string, unknown>;
}

export interface McpBridgeResponse {
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpBridgeHandle {
  socketPath: string;
  cleanup: () => void;
}

export function startMcpBridge(workspaceId: string, window: BrowserWindow): McpBridgeHandle;
```

### Modified Interfaces

```typescript
// src/main/agents/types.ts — add field to AgentSpawnContext
export interface AgentSpawnContext {
  workspaceId: string;
  prompt: string;
  worktreePath: string;
  model?: string;
  effort?: string;
  resumeSessionId?: string;
  permissionMode?: string;
  filePaths?: string[];
  mcpConfigPath?: string;  // NEW — path to MCP config JSON file
}
```

```typescript
// src/types.ts — add to TraceAPI interface
export interface TraceAPI {
  // ... existing methods ...
  syncWorkspaceTerminals(workspaceId: string, terminals: TerminalTab[]): Promise<void>;  // NEW
  onMcpAddTerminal(callback: (workspaceId: string, terminalId: string, name: string) => void): () => void;  // NEW
}
```

### No Database/GraphQL Schema Changes

This feature is entirely client-side (Electron main + renderer). No server-side changes needed.

---

## 4. API Design

### MCP Tool Definitions

The MCP server exposes these tools via the `@modelcontextprotocol/sdk` `StdioServerTransport`:

#### `read_terminal`

```typescript
{
  name: "read_terminal",
  description: "Read recent output from a terminal tab in the workspace",
  inputSchema: {
    type: "object",
    properties: {
      terminal_name: { type: "string", description: "Name of the terminal tab (e.g. 'Terminal 1', 'Run', 'Setup')" },
      lines: { type: "number", description: "Number of recent lines to read (default 50, max 500)", default: 50 },
    },
    required: ["terminal_name"],
  },
}
// Returns: { content: [{ type: "text", text: "<terminal output>" }] }
// Error: Terminal not found → isError: true with descriptive message
```

#### `write_terminal`

```typescript
{
  name: "write_terminal",
  description: "Send input/commands to a terminal tab. The input appears in the terminal in real-time.",
  inputSchema: {
    type: "object",
    properties: {
      terminal_name: { type: "string", description: "Name of the terminal tab" },
      input: { type: "string", description: "Text to send to the terminal (include \\n to execute commands)" },
    },
    required: ["terminal_name", "input"],
  },
}
// Returns: { content: [{ type: "text", text: "Input sent to 'Terminal 1'" }] }
// Error: Read-only terminal → isError: true, "Terminal 'Setup' is read-only. Use create_terminal to create a new interactive terminal."
```

#### `list_terminals`

```typescript
{
  name: "list_terminals",
  description: "List all terminal tabs in the workspace with their status",
  inputSchema: {
    type: "object",
    properties: {},
  },
}
// Returns: { content: [{ type: "text", text: JSON.stringify(terminals) }] }
// Shape: [{ name: string, processName: string, isShellOnly: boolean, readOnly: boolean, hasActivePty: boolean }]
```

#### `create_terminal`

```typescript
{
  name: "create_terminal",
  description: "Create a new terminal tab in the workspace",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Display name for the terminal tab" },
    },
    required: ["name"],
  },
}
// Returns: { content: [{ type: "text", text: "Created terminal 'Dev Server'" }] }
// Error: Max 8 terminals → isError: true with message
// Error: Name collision → isError: true with message
```

### Unix Domain Socket Protocol (MCP Bridge)

The MCP server ↔ Electron main communication uses newline-delimited JSON over a Unix domain socket.

**Request format** (MCP server → main):
```json
{"id": "req-1", "method": "readTerminal", "params": {"workspaceId": "ws123", "terminalName": "Terminal 1", "lines": 50}}
```

**Response format** (main → MCP server):
```json
{"id": "req-1", "result": {"text": "$ npm test\n\nPASSED 5 tests"}}
```

**Error response**:
```json
{"id": "req-1", "error": {"code": -1, "message": "Terminal 'Terminal 1' not found in workspace"}}
```

**Bridge methods**:

| Method | Params | Returns |
|--------|--------|---------|
| `readTerminal` | `{ workspaceId, terminalName, lines }` | `{ text: string }` |
| `writeTerminal` | `{ workspaceId, terminalName, input }` | `{ success: true }` |
| `listTerminals` | `{ workspaceId }` | `{ terminals: TerminalInfo[] }` |
| `createTerminal` | `{ workspaceId, name }` | `{ terminalId: string, name: string }` |

### New IPC Channels

| Channel | Direction | Purpose | Handler Location |
|---------|-----------|---------|------------------|
| `sync-workspace-terminals` | Renderer → Main | Push terminal list updates to main process terminal registry | `ipc.ts` → `terminalRegistry.ts` |
| `mcp-add-terminal` | Main → Renderer | Notify renderer to add a new terminal tab (created by MCP) | Renderer listener in `App.tsx` or terminal hook |

### Error Handling

- **Terminal not found**: Return MCP tool error with descriptive message listing available terminals
- **Write to read-only terminal**: Return MCP tool error suggesting `create_terminal`
- **PTY not alive**: For `read_terminal`, return whatever is in the ring buffer (may be stale). For `write_terminal`, attempt to auto-create PTY (mirrors existing `pty-write` IPC behavior in `ipc.ts:370-384`)
- **Socket connection lost**: MCP server logs error to stderr, tool calls return errors. Agent continues without terminal access (graceful degradation)
- **Max terminals exceeded**: Return MCP tool error (limit: 8 terminals per workspace)

---

## 5. Frontend Component Hierarchy

### No New UI Components Required

The feature reuses existing terminal UI entirely. Changes are limited to state management and IPC wiring.

### Component Impact

```
App.tsx
  └── useEffect: register onMcpAddTerminal listener  (NEW — ~10 lines)

TerminalTabs.tsx  (NO CHANGES — tabs render from terminalStore.terminals)
  └── TerminalTabContent.tsx  (NO CHANGES)
      └── Terminal.tsx  (NO CHANGES — xterm.js renders PTY data as usual)
```

### State Management Changes

**`terminalStore.ts`** — Extend existing Zustand store:

1. **New action: `addTerminalWithId(workspaceId, terminalId, name)`**
   - Like `addTerminal()` but accepts explicit `terminalId` and `name` from the MCP bridge
   - Adds the tab to the workspace's terminal list
   - Sets it as the active tab
   - Triggers projection update

2. **New side-effect: terminal sync to main**
   - After any action that modifies `_allTerminals` (init, add, kill, rerun, stop, runAllScripts), call `window.traceAPI.syncWorkspaceTerminals(workspaceId, terminals)`
   - This keeps the main process terminal registry up-to-date for MCP name resolution
   - Implementation: add sync call at the end of each mutating action (or use Zustand `subscribe()` middleware)

### Props Changes

None. The existing `TerminalTabs` props interface remains unchanged. MCP-created terminals flow through the same `terminals` array from the store.

### Re-render Optimization

- The `syncWorkspaceTerminals` IPC call is fire-and-forget (no state update on completion)
- The `onMcpAddTerminal` listener triggers a targeted store update via `addTerminalWithId`, which uses the existing `projectWorkspace()` projection pattern to minimize re-renders
- No new subscriptions or contexts introduced

---

## 6. Testing Strategy

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `src/main/mcp/__tests__/ringBuffer.test.ts` | Buffer append, overflow/circular behavior, readLines with ANSI stripping, edge cases (empty buffer, 0 lines, more lines than available) |
| `src/main/mcp/__tests__/terminalRegistry.test.ts` | Update/remove workspace terminals, resolveTerminalByName (found, not found, wrong workspace), listWorkspaceTerminals |
| `src/main/mcp/__tests__/mcpBridge.test.ts` | Socket server start/stop, request/response round-trip, error handling (invalid method, missing params), concurrent requests |

### Integration Tests

| Scenario | What It Validates |
|----------|-------------------|
| Ring buffer integrated into `pty.ts` | `createPty()` → write data → `readPtyBuffer()` returns correct output; `killPty()` cleans up buffer |
| MCP bridge end-to-end | Start socket server → connect MCP client → send readTerminal request → verify response contains PTY buffer data |
| Terminal registry sync | Renderer calls `syncWorkspaceTerminals` → main process registry updated → MCP `listTerminals` returns correct data |
| Agent spawn with MCP config | `spawnAgent()` creates socket, writes MCP config JSON, passes `--mcp-config` flag, cleans up on exit |

### E2E Test Cases

| Test Case | Steps |
|-----------|-------|
| Claude reads terminal output | 1. Initialize workspace with terminals. 2. Write "echo hello" to PTY. 3. Verify `read_terminal` MCP tool returns output containing "hello". |
| Claude writes to terminal | 1. Initialize workspace. 2. Call `write_terminal` with "ls\n". 3. Verify PTY received the data. 4. Verify xterm.js renders the command. |
| Claude lists terminals | 1. Initialize workspace with Setup, Run, Terminal 1. 2. Call `list_terminals`. 3. Verify response includes all 3 with correct readOnly flags. |
| Claude creates terminal | 1. Initialize workspace. 2. Call `create_terminal("Dev Server")`. 3. Verify new tab appears in renderer. 4. Verify PTY is created. 5. Verify `write_terminal` works on new terminal. |
| Write to read-only terminal rejected | 1. Call `write_terminal` on "Setup" tab. 2. Verify error response mentioning read-only. |
| MCP cleanup on agent stop | 1. Spawn agent. 2. Stop agent. 3. Verify socket file deleted, MCP config file deleted. |

### Test File Locations

Following the existing pattern (no test files exist yet in this codebase), tests would go in `__tests__/` directories co-located with source:
- `src/main/mcp/__tests__/ringBuffer.test.ts`
- `src/main/mcp/__tests__/terminalRegistry.test.ts`
- `src/main/mcp/__tests__/mcpBridge.test.ts`

---

## 7. Implementation Sequence

### Step 1: Ring Buffer + PTY Integration

**Files**: `src/main/mcp/ringBuffer.ts` (new), `src/main/pty.ts` (modify)

- Implement `RingBuffer` class with `append()`, `readLines()`, `clear()`
- Add `strip-ansi` dependency to `package.json`
- In `pty.ts`: create `buffers` Map, hook into `proc.onData()` to capture output, clean up in `killPty()`, export `readPtyBuffer(terminalId, lines)`
- **Dependencies**: None (foundation layer)
- **Parallelizable**: Yes — independent of all other steps

### Step 2: Terminal Registry

**Files**: `src/main/mcp/terminalRegistry.ts` (new), `src/main/ipc.ts` (modify), `src/preload.ts` (modify), `src/types.ts` (modify), `src/stores/terminalStore.ts` (modify)

- Create `terminalRegistry.ts` with `updateWorkspaceTerminals()`, `removeWorkspaceTerminals()`, `resolveTerminalByName()`, `listWorkspaceTerminals()`
- Add `sync-workspace-terminals` IPC handler in `ipc.ts` that calls `updateWorkspaceTerminals()`
- Expose `syncWorkspaceTerminals()` in `preload.ts` and `TraceAPI` type
- Add sync calls in `terminalStore.ts` mutating actions (or via Zustand `subscribe()`)
- **Dependencies**: None
- **Parallelizable**: Yes — can be done in parallel with Step 1

### Step 3: MCP Bridge (Unix Socket Server)

**Files**: `src/main/mcp/mcpBridge.ts` (new)

- Implement `startMcpBridge(workspaceId, window)` that creates a `net.Server` listening on `/tmp/trace-mcp-{workspaceId}.sock`
- Handle incoming JSON requests: `readTerminal` → `readPtyBuffer()`, `writeTerminal` → `writePty()`, `listTerminals` → `listWorkspaceTerminals()` + `getPtyProcesses()`, `createTerminal` → `createPty()` + IPC to renderer
- Return `McpBridgeHandle` with `socketPath` and `cleanup()` function
- **Dependencies**: Step 1 (ring buffer), Step 2 (terminal registry)
- **Parallelizable**: No — depends on Steps 1 and 2

### Step 4: MCP Server (Standalone Process)

**Files**: `src/main/mcp/terminalMcpServer.ts` (new), `vite.main.config.ts` (modify), `package.json` (modify)

- Add `@modelcontextprotocol/sdk` dependency
- Implement MCP server with `StdioServerTransport`, define 4 tools (`read_terminal`, `write_terminal`, `list_terminals`, `create_terminal`)
- Each tool handler connects to Unix socket, sends bridge request, returns result
- Parse CLI args: `--workspace-id`, `--socket-path`
- Add as separate Vite entry point in `vite.main.config.ts`
- **Dependencies**: Step 3 (bridge protocol definition — needs shared types)
- **Parallelizable**: Partially — tool definitions can be written in parallel with Step 3, but integration requires Step 3

### Step 5: Agent Spawn Integration

**Files**: `src/main/agents/spawnAgent.ts` (modify), `src/main/agents/claude.ts` (modify), `src/main/agents/types.ts` (modify)

- In `types.ts`: add `mcpConfigPath?: string` to `AgentSpawnContext`
- In `spawnAgent.ts`: before spawning Claude, call `startMcpBridge()` to start socket server, write MCP config JSON to temp file, set `mcpConfigPath` in spawn context. On `child.on('close')`: call `bridge.cleanup()` and delete config file.
- In `claude.ts` `buildCommand()`: if `ctx.mcpConfigPath`, add `--mcp-config`, `ctx.mcpConfigPath` to args
- **Dependencies**: Steps 3 + 4
- **Parallelizable**: No — final integration step

### Step 6: `create_terminal` Renderer Integration

**Files**: `src/stores/terminalStore.ts` (modify), `src/preload.ts` (modify), `src/types.ts` (modify), renderer listener registration (modify `App.tsx` or relevant component)

- Add `addTerminalWithId(workspaceId, terminalId, name)` action to `terminalStore.ts`
- Expose `onMcpAddTerminal()` event listener in `preload.ts`
- Register listener in renderer that calls `addTerminalWithId()` when main process sends `mcp-add-terminal` event
- In `mcpBridge.ts` `createTerminal` handler: after creating PTY, send `mcp-add-terminal` IPC to renderer
- **Dependencies**: Step 3 (bridge handles createTerminal)
- **Parallelizable**: Partially — store action can be built in parallel with Step 3

### Dependency Graph

```
Step 1 (Ring Buffer) ──────┐
                            ├──→ Step 3 (MCP Bridge) ──→ Step 4 (MCP Server) ──→ Step 5 (Agent Integration)
Step 2 (Terminal Registry) ─┘                                                        │
                                                                                     │
Step 6 (create_terminal UI) ◄────────────────────────────────────────────────────────┘
```

Steps 1 and 2 can be built in parallel. Steps 3-5 are sequential. Step 6 can be partially parallelized with Steps 3-4.

---

## 8. Risks & Technical Debt

### Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Claude CLI `--mcp-config` unavailability** | High | Detect flag support at spawn time (similar to existing `detectEffortSupport()` in `claude.ts`). If unsupported, skip MCP config and log warning. Feature degrades gracefully — agent runs without terminal tools. |
| **Unix socket cleanup on crash** | Medium | Socket file at `/tmp/trace-mcp-{workspaceId}.sock` may persist if Electron crashes. On bridge startup, check if socket file exists and `unlink()` it before binding. Also add cleanup in `killAllPtys()` and app quit handler. |
| **MCP server build packaging** | Medium | The separate Vite entry point must produce a standalone CommonJS file that runs with `node`. Verify `@modelcontextprotocol/sdk` and `strip-ansi` are available at the resolved path. May need `external` config in Vite to avoid bundling node_modules that should be resolved at runtime. |
| **Terminal sync race condition** | Low | If terminal state changes between the renderer's sync IPC call and the MCP server's tool call, the registry may be momentarily stale. Mitigation: sync is fast (< 1ms IPC) and terminal changes are infrequent during agent runs. |
| **Ring buffer memory under heavy output** | Low | 50KB per terminal × 10 terminals = 500KB. Negligible. But a program printing binary/garbage data could fill the buffer with non-useful content. Mitigation: UTF-8 replacement of invalid sequences in `readLines()`. |

### Performance Concerns

- **Ring buffer writes**: `append()` uses string concatenation + `slice()`. For very high-throughput terminals (e.g., `cat /dev/urandom`), this could cause GC pressure from string allocations. Consider switching to a `Buffer`-based circular implementation if profiling shows issues. For v1, string-based is simpler and sufficient.
- **Socket latency**: Unix domain sockets on macOS have ~0.1ms round-trip. Well within the 50ms target for read operations.
- **Terminal sync IPC frequency**: `syncWorkspaceTerminals` fires on every terminal mutation. These are infrequent (user creates/kills terminals manually). No throttling needed.

### Security Considerations

- **Workspace scoping**: The MCP bridge validates `workspaceId` on every request. The MCP server only knows its own workspace ID (passed via CLI arg). Cross-workspace access is impossible.
- **Socket file permissions**: Unix socket inherits process umask. Since both processes run as the same user, this is fine. No external access risk.
- **Command injection via `write_terminal`**: The MCP server sends raw input to the PTY. Claude could send destructive commands. This is accepted per the "trust the agent" model documented in the PRD. Users see commands in real-time and can Ctrl+C.
- **Socket path predictability**: `/tmp/trace-mcp-{workspaceId}.sock` uses the full workspaceId (UUID). Guessing is impractical.

### Potential Technical Debt

- **Terminal registry duplication**: The main process terminal registry is a copy of the renderer's `_allTerminals`. This is intentional duplication to avoid cross-process latency, but introduces a sync obligation. If the sync mechanism breaks, MCP name resolution silently fails. Consider adding a health check or fallback to on-demand query.
- **String-based ring buffer**: Simple but not optimal for very large buffers. If we later increase the buffer size or add streaming, a `Buffer`-based implementation would be more efficient.
- **No rate limiting on `write_terminal`**: Claude could flood a terminal with rapid writes. For v1 this is acceptable; monitor usage and add throttling if needed.
- **MCP config as temp file**: The JSON config file is written to `os.tmpdir()` and deleted on agent close. If the process crashes, orphaned files accumulate. Consider periodic cleanup of stale config files.

### Breaking Changes

None. This feature is purely additive:
- No existing APIs are modified
- No existing IPC channels change behavior
- The terminal store gains new actions but existing actions are unchanged
- The `AgentSpawnContext` gains an optional field (`mcpConfigPath`)
- Claude agents that don't support `--mcp-config` simply ignore it (flag is only added when detected)
