# Agent Decoupling Roadmap

Status: In Progress

## Completed

- [x] Phase 1: Schema rename + agent type tracking (PR #TBD)

## Phase 2: Open AgentType + Dynamic Store Defaults

- [ ] Widen `AgentType` from `"claude" | "codex"` to `string`
- [ ] Add `KNOWN_AGENTS` constants for type safety without closed union
- [ ] Replace hardcoded `DEFAULT_DETECTED_AGENTS` with empty array
- [ ] Derive `selectedAgent`/`selectedModel`/`selectedEffort` from detection results
- [ ] Add `detecting` loading state to `agentRunStore`
- [ ] Add UI guard in `ModelEffortSelector` for empty agent state

Files: `src/main/agents/types.ts`, `src/types.ts`, `src/stores/agentRunStore.ts`, `src/components/ModelEffortSelector.tsx`

## Phase 3: Refactor spawnAgent Signature + Prompt Delegation

Depends on: Phase 2

- [ ] Add `SpawnConfig` interface (replace 12 positional params)
- [ ] Add `SystemPromptParts` interface
- [ ] Add optional `wrapSystemPrompt()` method to `AgentAdapter`
- [ ] Move `<trace-internal>` wrapping into Claude adapter's `wrapSystemPrompt()`
- [ ] Implement plain-text `wrapSystemPrompt()` in Codex adapter
- [ ] Refactor `spawnAgent.ts` to accept `SpawnConfig`, delegate prompt wrapping
- [ ] Update IPC handler + preload to pass `SpawnConfig` object
- [ ] Remove `<trace-internal>` from `RunButtons.tsx`, `ThreadInput.tsx`, pass structured flags instead

Files: `src/main/agents/types.ts`, `src/main/agents/claude.ts`, `src/main/agents/codex.ts`, `src/main/agents/spawnAgent.ts`, `src/main/ipc.ts`, `src/preload.ts`, `src/types.ts`, `src/components/RunButtons.tsx`, `src/components/ThreadInput.tsx`

## Phase 4: Per-Run Metadata on Events

Depends on: Phase 1 (independent of 2/3)

- [ ] Add `runMetadata Json?` to Event model in Prisma
- [ ] Include `{ model, effort, agentType }` in Stop event payload from `spawnAgent.ts`
- [ ] Persist `run_metadata` in `eventService.ts`
- [ ] Expose `runMetadata` in GraphQL Event type

Files: `server/prisma/schema.prisma`, `src/main/agents/spawnAgent.ts`, `server/src/services/eventService.ts`, `server/src/schema/event/schema.graphql`

## Phase 5: Generalize Tool Detection (Cleanup)

Depends on: Phases 1-4

- [ ] Add generic `inputRequired`/`inputRequiredReason` fields to `ParsedEnrichment`
- [ ] Widen `detectedToolName` from closed union to `string`
- [ ] Update Claude parser to set generic flags alongside tool-specific detection
- [ ] Update Codex parser for any input-required signals
- [ ] Replace "Claude" references in eventService comments with "agent"

Files: `src/main/agents/types.ts`, `src/main/agents/claudeParser.ts`, `src/main/agents/codex.ts`, `server/src/services/eventService.ts`

## Dependency Graph

```
Phase 1 → Phase 2 → Phase 3
Phase 1 → Phase 4 (parallel with 2/3)
All → Phase 5
```
