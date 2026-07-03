# 08 - Session Attach

## Summary

`trace sessions attach <id>`: a streaming session transcript in the terminal with stdin prompting. This is the end-to-end proof of the whole client pipeline — timeline seed, live subscription, client-core normalization, node rendering, fire-and-forget prompting — before any of it is wrapped in RPC for Neovim.

## Plan coverage

Owns plan lines:

- 119: `sessions attach` command
- 134: attach as the terminal proof of the pipeline
- 143: optimistic prompt echo

## What needs to happen

- Seed: fetch a recent page via `sessionTimeline(sessionId, limit)`, feed events through `handleSessionEvent` / `routeSessionOutput`, render the resulting nodes from `buildSessionNodes`.
- Live: subscribe `sessionEvents(sessionId)`, keep feeding the same handlers, and render nodes incrementally as they append/patch.
- Rendering: plain text blocks with distinct prefixes per node kind (`you >`, agent text, tool-use one-liners, plan/question blocks). No TUI framework, no cursor addressing — append-only output that works in any terminal.
- Input: stdin lines send prompts via ticket 07's helper, with an optimistic local echo (`optimisticallyInsertSessionMessage` → reconcile when the event returns).
- `--json`: NDJSON stream of normalized nodes instead of human rendering (a preview of ticket 12's `session/nodes` payloads).
- Ctrl-C detaches (closes subscription, exits 0); the session keeps running. Print a status header line (session name, tool, agentStatus) on attach and on status change.

## Dependencies

- [05 - Read Commands](05-read-commands.md)
- [07 - Write Commands](07-write-commands.md)

## Completion requirements

- [ ] Attaching mid-session shows recent history and then streams live output
- [ ] Prompts sent from stdin appear optimistically and reconcile without duplication
- [ ] Node kinds (prompt, agent text, tool use, plan, question) render distinguishably
- [ ] Ctrl-C detaches cleanly without affecting the session
- [ ] `--json` emits NDJSON nodes only
- [ ] Pagination: attaching to a long session does not fetch the full history

## Implementation notes

- Everything here must go through client-core's normalization (`buildSessionNodes` in `packages/client-core/src/session/nodes.ts`) — if the renderer needs data the nodes don't carry, fix it in the shared node builder path where web also benefits, not with a CLI-side event parser.
- Keep the renderer a pure `nodes → lines` function; ticket 12 reuses the node-diffing logic, and tests snapshot it.

## How to test

1. Attach to a live session driven from the web UI; verify output parity with the web transcript (same blocks, same order).
2. Send a prompt from the attach stdin; verify it appears once (optimistic + reconcile) and the agent responds.
3. Snapshot-test the node renderer against fixture node lists, including plan and question nodes.
