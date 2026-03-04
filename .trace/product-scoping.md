# AI Terminal Interaction via MCP — Product Requirements Document

## 1. Overview

Add the ability for Claude Code agents running inside Trace to interact with the workspace's UI terminals (xterm.js + node-pty) through MCP (Model Context Protocol) tools. Today, the AI agent and the terminal UI are completely disconnected — Claude runs as an isolated CLI process while terminals live in a separate PTY system. This feature bridges that gap by exposing terminal read/write/management capabilities as MCP tools that Claude can call during its runs.

The primary pain point this solves: users currently have to manually copy-paste terminal output (error logs, build failures, dev server output) into the AI chat. With this feature, Claude can directly observe terminal state and send commands to terminals the user can see in real-time.

## 2. Problem Statement

- **What exists today**: Claude Code agents spawn as isolated child processes (`claude --output-format stream-json`) in git worktrees. The workspace terminals (Setup, Run, Terminal 1+) are separate PTY sessions managed by Electron's main process. There is zero integration between the two systems.
- **Who is affected**: Every Trace user who runs Claude agents alongside terminal-based workflows (dev servers, test runners, build tools, log watchers).
- **Why current solutions fail**: When a dev server crashes or tests fail in a terminal, users must manually select the error text, copy it, switch to the AI chat, paste it, and explain the context. This breaks flow, loses context (Claude doesn't know which terminal, what was running, or what came before), and is especially painful with long stack traces or interleaved log output.

## 3. Target Users

- **Primary**: Developers using Trace to run Claude agents on coding tasks that involve running processes — building, testing, starting servers, running migrations, checking logs.
- **Secondary**: Users running multiple workspaces in parallel who need Claude to autonomously verify its changes work (run tests, start server, check output) without manual intervention.
- **Tertiary**: Users who want Claude to help debug issues visible in terminal output (crash logs, compilation errors) without copy-pasting.

## 4. Goals & Success Metrics

### Goals
1. Eliminate manual copy-paste of terminal output into AI chat
2. Enable Claude to execute and observe commands in user-visible terminals
3. Make terminal interaction transparent — users watch commands happen in real-time
4. Maintain workspace isolation — Claude can only access its own workspace's terminals

### Success Metrics
- **Adoption**: % of agent runs that use at least one terminal MCP tool
- **Copy-paste reduction**: Decrease in user messages that contain pasted terminal output
- **Autonomy**: % of agent runs that complete without user intervention (baseline vs. after)
- **User satisfaction**: Qualitative feedback on the "watch it happen" experience

### Definition of Done
Claude can list, read from, write to, and create terminals within its workspace. Commands appear in the xterm.js UI in real-time. Terminal output is captured and returned to Claude as tool results.

## 5. User Stories & Use Cases

### UC1: Claude reads terminal errors to diagnose a failure
**As a** developer running tests in a terminal, **I want** Claude to read the test output directly, **so that** I don't have to copy-paste error messages into chat.

**Flow**:
1. User has `npm test` running in "Terminal 1" showing a failing test
2. User sends Claude a message: "Fix the failing test in Terminal 1"
3. Claude calls `list_terminals` → sees "Terminal 1" with process `node`
4. Claude calls `read_terminal({ terminal_name: "Terminal 1", lines: 100 })` → gets the last 100 lines including the error
5. Claude analyzes the error, edits the code, optionally runs the test again via `write_terminal`

**Acceptance criteria**:
- Claude receives clean text output (ANSI escape codes stripped)
- Output includes the most recent N lines from the terminal's scrollback
- Works for both idle terminals (command finished) and active processes (dev server running)

### UC2: Claude runs a command and observes the result
**As a** developer, **I want** Claude to run build/test commands in a visible terminal, **so that** I can watch what's happening and Claude can react to the output.

**Flow**:
1. User asks Claude: "Run the tests and fix any failures"
2. Claude calls `list_terminals` → sees available terminals
3. Claude calls `write_terminal({ terminal_name: "Terminal 1", input: "npm test\n" })` → command appears in the terminal UI
4. Claude waits, then calls `read_terminal({ terminal_name: "Terminal 1", lines: 200 })` → sees test results
5. If tests fail, Claude edits code and repeats

**Acceptance criteria**:
- The typed command appears in the xterm.js terminal in real-time (user sees it)
- Claude can read the resulting output after the command executes
- User can interrupt the terminal (Ctrl+C) at any time

### UC3: Claude creates a terminal for a new task
**As a** developer, **I want** Claude to create a new terminal tab for running a separate process, **so that** it doesn't interfere with my existing terminal sessions.

**Flow**:
1. User asks: "Start the dev server and run tests in parallel"
2. Claude calls `create_terminal({ name: "Dev Server" })` → new tab appears in UI
3. Claude calls `write_terminal({ terminal_name: "Dev Server", input: "npm run dev\n" })`
4. Claude calls `write_terminal({ terminal_name: "Terminal 1", input: "npm test\n" })`
5. Claude reads from both terminals to check results

**Acceptance criteria**:
- New terminal tab appears in the workspace's terminal bar
- Terminal is a fully functional PTY with the workspace's CWD and environment
- User can interact with Claude-created terminals normally

### UC4: Claude monitors a long-running process
**As a** developer, **I want** Claude to check the output of my dev server when something goes wrong, **so that** I can ask "why is my server crashing?" and Claude can see the logs.

**Flow**:
1. Dev server is running in "Run" tab, showing crash logs
2. User asks: "Why does the server keep crashing?"
3. Claude calls `read_terminal({ terminal_name: "Run", lines: 150 })` → sees the crash output
4. Claude diagnoses the issue from the logs

**Acceptance criteria**:
- Claude can read from read-only terminals (Setup, Run) as well as interactive ones
- Output from long-running processes is captured in the ring buffer
- ANSI color codes are stripped for clean text

### UC5: Claude lists terminals to understand workspace state
**As a** developer, **I want** Claude to see what terminals exist and what's running in them, **so that** it can make informed decisions about where to run commands.

**Flow**:
1. User asks: "Check if the dev server is still running"
2. Claude calls `list_terminals` → gets `[{name: "Run", process: "node", is_shell_only: false}, {name: "Terminal 1", process: "zsh", is_shell_only: true}]`
3. Claude responds: "Yes, your dev server is running in the Run tab"

**Acceptance criteria**:
- Response includes terminal name, running process name, and whether it's idle (shell-only)
- Includes read-only status so Claude knows it can't write to Setup/Run tabs

## 6. Functional Requirements

### 6.1 MCP Server (P0)

| ID | Requirement | Priority |
|----|-------------|----------|
| MCP-1 | Implement a stdio-based MCP server that runs as a child process spawned by Trace's Electron main process | P0 |
| MCP-2 | MCP server must communicate with the PTY session manager (`src/main/pty.ts`) to read/write terminal data | P0 |
| MCP-3 | Generate an MCP config JSON file per agent spawn, scoped to the workspace's terminal IDs | P0 |
| MCP-4 | Pass `--mcp-config <path>` flag to Claude CLI in `ClaudeAdapter.buildCommand()` | P0 |
| MCP-5 | Clean up MCP config file and server process when agent stops or workspace is deleted | P0 |

### 6.2 `read_terminal` Tool (P0)

| ID | Requirement | Priority |
|----|-------------|----------|
| RT-1 | Accept parameters: `terminal_name` (string, name of the tab) and `lines` (number, default 50, max 500) | P0 |
| RT-2 | Return the last N lines of terminal output as plain text | P0 |
| RT-3 | Strip ANSI escape codes from output before returning | P0 |
| RT-4 | Maintain a per-PTY ring buffer in the main process that captures output data from `proc.onData()` | P0 |
| RT-5 | Ring buffer should store up to 50,000 characters per terminal (configurable) | P0 |
| RT-6 | Work with both interactive and read-only terminals | P0 |
| RT-7 | Return an error if the terminal doesn't exist or doesn't belong to the workspace | P0 |
| RT-8 | Resolve terminal by name within the workspace (not by raw terminalId) | P0 |

### 6.3 `write_terminal` Tool (P0)

| ID | Requirement | Priority |
|----|-------------|----------|
| WT-1 | Accept parameters: `terminal_name` (string) and `input` (string, the text/command to send) | P0 |
| WT-2 | Write the input to the PTY's stdin via `session.process.write(data)` | P0 |
| WT-3 | Only allow writing to non-read-only terminals (reject writes to Setup/Run tabs) | P0 |
| WT-4 | Input appears in the xterm.js UI in real-time (the user sees it typed) | P0 |
| WT-5 | Return success/failure status | P0 |
| WT-6 | If the terminal PTY doesn't exist yet (not mounted), create it on demand | P1 |

### 6.4 `list_terminals` Tool (P1)

| ID | Requirement | Priority |
|----|-------------|----------|
| LT-1 | Return all terminals for the workspace: name, process name, is_shell_only, read_only status | P1 |
| LT-2 | Use existing `getPtyProcesses()` from `src/main/pty.ts` for process info | P1 |
| LT-3 | Include whether the terminal has a PTY session (is mounted/alive) | P1 |

### 6.5 `create_terminal` Tool (P2)

| ID | Requirement | Priority |
|----|-------------|----------|
| CT-1 | Accept parameters: `name` (string, tab display name) and optionally `command` (string, startup command) | P2 |
| CT-2 | Create a new terminal tab in the workspace's terminal store | P2 |
| CT-3 | Use the workspace's CWD and environment variables | P2 |
| CT-4 | New tab appears in the UI terminal bar immediately | P2 |
| CT-5 | Return the terminal name for subsequent read/write calls | P2 |
| CT-6 | Limit max terminals per workspace (e.g., 8) to prevent abuse | P2 |

### 6.6 Terminal Output Ring Buffer (P0)

| ID | Requirement | Priority |
|----|-------------|----------|
| RB-1 | Add a per-terminal ring buffer in `src/main/pty.ts` that captures all `proc.onData()` output | P0 |
| RB-2 | Buffer stores raw text with ANSI codes (stripping happens at read time) | P0 |
| RB-3 | Buffer is circular — oldest data is dropped when capacity is exceeded | P0 |
| RB-4 | Default capacity: 50,000 characters per terminal | P0 |
| RB-5 | Buffer is created when PTY is created and destroyed when PTY is killed | P0 |
| RB-6 | Expose a `readPtyBuffer(terminalId, lines)` function from `pty.ts` | P0 |

## 7. Non-Functional Requirements

- **Performance**: Ring buffer writes must be O(1) — appending to the buffer should not slow down terminal rendering. Reading should be fast (< 10ms for 500 lines).
- **Memory**: 50KB per terminal ring buffer x ~10 terminals max = ~500KB overhead. Negligible.
- **Security**: MCP tools are scoped to the workspace's terminal IDs. The MCP server validates that requested terminal names belong to the workspace. No cross-workspace access.
- **Reliability**: If the MCP server crashes, the agent continues running (degrades gracefully — terminal tools return errors but agent doesn't die). MCP server should be restarted if possible.
- **Latency**: Terminal write operations should feel instant to the user watching the terminal. Read operations should return within 50ms.
- **Compatibility**: Requires Claude Code CLI version that supports `--mcp-config` flag. Detection should check for this capability.

## 8. UX/UI Requirements

### Transparent Interaction
- When Claude writes to a terminal, the command appears in xterm.js exactly as if a user typed it — character by character is not required, but it must be visible in the terminal.
- The user can see the terminal tab's existing visual indicator (e.g., the green pulse animation already used for running processes in `TerminalTabs.tsx`) when Claude is interacting with it.
- No approval dialogs or confirmation prompts — commands execute immediately (consistent with the "trust the agent" model).

### Terminal Tab Indicators
- Consider adding a subtle indicator on terminal tabs when the AI has recently interacted with them (e.g., a small icon or brief highlight). This is a nice-to-have for v1.

### No New UI Surfaces Required
- The feature uses existing terminal UI components — no new panels, modals, or views needed.
- Claude-created terminals appear as normal tabs with the same affordances.

### Existing Patterns to Follow
- Terminal tabs follow the existing `TerminalTabs.tsx` component patterns
- Terminal creation follows the existing `addTerminal()` pattern in terminalStore
- Process indicators reuse the existing green pulse from `TerminalTabs.tsx`

## 9. Technical Architecture

### 9.1 Overview

```
Claude CLI <--stdio--> MCP Server (child process) <--IPC--> Electron Main Process <--PTY--> Terminals
                                                                   |
                                                             Ring Buffers (per PTY)
```

### 9.2 Files to Modify

| File | Change |
|------|--------|
| `src/main/pty.ts` | Add per-PTY ring buffer; add `readPtyBuffer(terminalId, lines)` export; capture output in `proc.onData()` |
| `src/main/agents/claude.ts` | Add `--mcp-config` flag to `buildCommand()` args |
| `src/main/agents/spawnAgent.ts` | Generate MCP config JSON before spawn; pass config path; clean up on exit |
| `src/main/agents/types.ts` | Add `mcpConfigPath` to `AgentSpawnContext` |
| `src/main/ipc.ts` | Add IPC handlers for MCP server communication (terminal read/write/list/create operations) |
| `src/stores/terminalStore.ts` | Add action for programmatic terminal creation with custom name; expose terminal lookup by name for a workspace |
| `src/preload.ts` | Expose any new IPC methods needed for renderer-side terminal creation triggered by MCP |
| `src/types.ts` | Add types for MCP config, ring buffer, new IPC channels |

### 9.3 New Files to Create

| File | Purpose |
|------|---------|
| `src/main/mcp/terminalMcpServer.ts` | MCP server implementation — stdio transport, tool definitions, request handling |
| `src/main/mcp/ringBuffer.ts` | Ring buffer class for capturing terminal output |
| `src/main/mcp/ansiStrip.ts` | Utility to strip ANSI escape codes from terminal output (or use `strip-ansi` npm package) |

### 9.4 MCP Server Architecture

The MCP server runs as a **child process spawned by Trace's Electron main process** using stdio transport (stdin/stdout for MCP protocol messages, stderr for debug logging).

**Communication flow**:
1. Before spawning Claude, `spawnAgent.ts` starts the MCP server process
2. The MCP server is a Node.js script that implements the MCP protocol (tool listing, tool execution)
3. The MCP server communicates with Trace's main process via Node.js child process IPC (`process.send()` / `process.on('message')`) to access PTY operations
4. A temporary MCP config JSON file is written to disk, referencing the MCP server script:
   ```json
   {
     "mcpServers": {
       "trace-terminal": {
         "command": "node",
         "args": ["/path/to/terminalMcpServer.js", "--workspace-id", "<id>"]
       }
     }
   }
   ```
5. Claude CLI receives `--mcp-config /path/to/config.json`
6. When Claude calls an MCP tool, the MCP server handles it by communicating with main process via IPC

### 9.5 Ring Buffer Design

```typescript
// src/main/mcp/ringBuffer.ts
class RingBuffer {
  private buffer: string = '';
  private maxSize: number;

  constructor(maxSize: number = 50_000) { this.maxSize = maxSize; }

  append(data: string): void {
    this.buffer += data;
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize);
    }
  }

  readLines(count: number): string {
    const stripped = stripAnsi(this.buffer);
    const lines = stripped.split('\n');
    return lines.slice(-count).join('\n');
  }

  clear(): void { this.buffer = ''; }
}
```

Integrated into `pty.ts`:
```typescript
const buffers = new Map<string, RingBuffer>();

// In createPty():
buffers.set(terminalId, new RingBuffer());
proc.onData((data) => {
  buffers.get(terminalId)?.append(data);
  // ... existing window.webContents.send("pty-data", ...) ...
});

// In killPty():
buffers.delete(terminalId);
```

### 9.6 Terminal Name Resolution

MCP tools use human-readable terminal names ("Terminal 1", "Run", "Setup") rather than internal IDs (`shell-abc123-1`). The MCP server resolves names to IDs:

- On each tool call, the MCP server queries the main process for the workspace's terminal list (names -> IDs mapping)
- This uses the existing `_allTerminals` Map in terminalStore, accessed via a new IPC handler
- Dynamic resolution ensures newly created terminals are immediately accessible

### 9.7 Claude CLI MCP Support

Claude Code CLI supports `--mcp-config` for loading MCP servers. The config file format follows the standard MCP configuration schema. `ClaudeAdapter.buildCommand()` adds this flag when the MCP config file path is available in the spawn context.

### 9.8 Workspace Scoping

Security boundary: The MCP server is instantiated per-workspace and only knows the terminal IDs belonging to that workspace. It cannot reference terminal IDs from other workspaces because:
1. It only receives its own workspaceId at startup
2. Terminal name resolution only searches within that workspace's `_allTerminals` entry
3. The IPC handler validates workspaceId ownership before performing PTY operations

## 10. Implementation Plan

### Phase 1: Ring Buffer & PTY Read (P0, build first)
1. Implement `RingBuffer` class in `src/main/mcp/ringBuffer.ts`
2. Integrate ring buffer into `src/main/pty.ts` — capture output in `proc.onData()`, clean up in `killPty()`
3. Add `readPtyBuffer(terminalId, lines)` export to `pty.ts`
4. Add ANSI stripping utility (use `strip-ansi` package or minimal implementation)
5. Add IPC handler for reading terminal buffer

**Complexity**: Low-medium. Straightforward data structure addition to existing PTY system.

### Phase 2: MCP Server Skeleton (P0, build second)
1. Create `src/main/mcp/terminalMcpServer.ts` implementing MCP stdio transport
2. Implement `read_terminal` and `write_terminal` tool definitions
3. Set up IPC communication channel between MCP server process and Electron main process
4. Implement terminal name -> ID resolution via IPC

**Complexity**: Medium. Requires understanding MCP protocol and setting up inter-process communication.

### Phase 3: Agent Integration (P0, build third)
1. Modify `spawnAgent.ts` to start MCP server before agent spawn
2. Generate MCP config JSON file with workspace-scoped parameters
3. Modify `ClaudeAdapter.buildCommand()` to add `--mcp-config` flag
4. Handle MCP server lifecycle (start before agent, stop after agent exits)
5. Clean up temp config files on exit

**Complexity**: Medium. Careful lifecycle management needed.

### Phase 4: `list_terminals` Tool (P1)
1. Add `list_terminals` tool to MCP server
2. Query workspace terminals via IPC (names, process info, read-only status)
3. Use existing `getPtyProcesses()` for process metadata

**Complexity**: Low. Leverages existing infrastructure.

### Phase 5: `create_terminal` Tool (P2)
1. Add `create_terminal` tool to MCP server
2. Add IPC handler that creates terminal in store and spawns PTY
3. Add terminal count limit enforcement
4. Ensure new tab renders in UI immediately

**Complexity**: Medium. Requires coordinating store updates from the main process (store lives in renderer).

### Key Technical Decisions to Make
1. **IPC mechanism between MCP server and Electron main**: Node.js `child_process` IPC (`process.send`) vs Unix domain socket vs named pipe. Recommendation: `process.send()` is simplest since Trace already spawns the MCP server.
2. **ANSI stripping**: Use `strip-ansi` npm package (well-maintained, handles edge cases) vs minimal regex. Recommendation: `strip-ansi` package.
3. **MCP SDK**: Use `@modelcontextprotocol/sdk` npm package for protocol implementation vs hand-roll. Recommendation: Use the SDK — it handles JSON-RPC framing, tool schemas, and transport.
4. **Store updates from main process**: For `create_terminal`, the main process needs to update the renderer's Zustand store. Options: (a) IPC round-trip to renderer, (b) share state via IPC. Recommendation: IPC message to renderer that triggers store action.

## 11. Scope & Constraints

### In Scope (v1)
- MCP server spawned per workspace with stdio transport
- `read_terminal` tool with ring buffer and ANSI stripping
- `write_terminal` tool for interactive (non-read-only) terminals
- `list_terminals` tool for workspace terminal discovery
- `create_terminal` tool for creating new terminal tabs
- Workspace-scoped terminal access (no cross-workspace)
- Transparent UX: commands visible in terminal UI in real-time
- Ring buffer with configurable capacity (default 50K chars)
- MCP config generation and lifecycle management

### Out of Scope (v1)
- Terminal output streaming/watching (real-time subscription to new output) — Claude polls via `read_terminal`
- Terminal resize/close/rename via MCP tools
- Cross-workspace terminal access
- User-selectable text sent to AI (separate feature)
- AI-initiated terminal focus switching in the UI
- Custom MCP tool configuration by users
- Codex agent support (Claude-only for v1)
- Web-based terminal sharing or remote access

### Known Constraints
- Requires Claude Code CLI version with `--mcp-config` support — need to detect this capability
- The MCP server adds one additional child process per active workspace
- Ring buffer memory grows linearly with number of active terminals
- Terminal store lives in the renderer process — `create_terminal` requires IPC coordination

## 12. Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Claude Code CLI `--mcp-config` support | External | Must verify minimum CLI version required |
| `@modelcontextprotocol/sdk` npm package | New dependency | MCP protocol implementation |
| `strip-ansi` npm package | New dependency | ANSI escape code removal |
| Existing PTY system (`src/main/pty.ts`) | Internal | Core integration point — ring buffer hooks into `proc.onData()` |
| Existing terminal store (`src/stores/terminalStore.ts`) | Internal | Terminal name resolution and `create_terminal` coordination |
| Existing agent spawn system (`src/main/agents/`) | Internal | MCP config injection and lifecycle management |

## 13. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Claude Code CLI doesn't support `--mcp-config` in current version | Blocks entire feature | Low | Check Claude Code docs; detect capability at spawn time; show user-friendly error if unsupported |
| MCP server process crashes mid-agent-run | Agent loses terminal access | Low | Agent continues without terminal tools (graceful degradation); consider auto-restart |
| Ring buffer misses output (race condition between PTY data and buffer append) | `read_terminal` returns incomplete data | Low | Buffer append is synchronous in `proc.onData()` callback — same event loop, no race |
| Claude writes destructive commands to terminal | User's environment damaged | Medium | Accepted risk per user's choice of "trust the agent" model. User can see commands in real-time and Ctrl+C to interrupt |
| Terminal name collisions (user creates "Terminal 1", Claude references "Terminal 1") | Wrong terminal targeted | Low | Names are unique within a workspace by construction (store enforces this) |
| MCP server adds latency to agent startup | Slower workspace creation | Low | MCP server startup is fast (< 200ms for Node.js process); runs in parallel with other setup |
| `create_terminal` from main process doesn't update renderer store | Ghost terminals, UI out of sync | Medium | Use IPC message to renderer triggering store action; verify with integration test |

## 14. Open Questions

1. **MCP config hot-reload**: If the user creates/destroys terminals mid-run, should the MCP server's terminal name mapping update dynamically? Or is the mapping fixed at spawn time? (Recommendation: dynamic — query on each tool call)
2. **`write_terminal` to read-only terminals**: Should this be a hard error, or should it silently create a new interactive terminal? (Recommendation: hard error with descriptive message suggesting `create_terminal`)
3. **Claude Code `--mcp-config` flag availability**: Which CLI version introduced this? Need to verify and add version detection.
4. **Terminal output encoding**: Should the ring buffer handle non-UTF-8 output (binary data from programs)? (Recommendation: treat as UTF-8, replace invalid sequences)
5. **Rate limiting**: Should `write_terminal` have any rate limiting to prevent Claude from flooding a terminal? (Recommendation: no for v1, monitor usage)
6. **`read_terminal` timing**: When Claude writes a command and then reads, how does it know the command finished? (Recommendation: document that Claude should use heuristics like checking for shell prompt, or use a delay — this is the agent's responsibility, not Trace's)
