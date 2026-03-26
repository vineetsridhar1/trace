# 20 — Per-Scope Autonomy Settings

## Summary

Autonomy modes should be configurable at multiple levels: org, project, channel (future), chat, and ticket. More specific settings override less specific ones. A channel set to `observe` stays observe-only even if the org default is `act`.

## What needs to happen

### Scope-level AI settings

- Add an optional `aiMode` field (observe/suggest/act/null) to entities that support scope-level overrides:
  - `Chat` model — per-chat autonomy setting
  - `Ticket` model — per-ticket autonomy setting
  - `Project` model — per-project autonomy setting
  - `Channel` model — pre-wire this for when channels are built out
- `null` means "inherit from parent" (fall through to org default)

### Resolution order

- Create a function `resolveAutonomyMode(scope, orgSettings)` that resolves the effective mode:
  1. Scope-level override (if set on the specific chat/ticket/channel)
  2. Project-level override (if the scope belongs to a project with an override)
  3. Org-level default
- Special defaults for chat types (from ticket 17): DMs default to `observe`, group chats default to `suggest`
  <!-- Ticket 17 created: `ChatType` ("dm" | "group") is exported from `router.ts`. The `AgentContextPacket` now has an `isDm: boolean` field and the context builder detects DM scope via `scopeEntity.data.type === "dm"`. Use `getAgentChatType(orgId, chatId)` from the router or `packet.isDm` in the pipeline when resolving autonomy defaults for chat scopes. -->

### UI

- Add a toggle/dropdown in chat settings, ticket detail, and project settings to set the AI mode
- Show the effective mode (resolved, including inheritance) so users understand what's active
- Only org admins and entity owners can change AI settings

### Integration

- The context builder should resolve the effective autonomy mode and include it in the context packet
- The policy engine should use the resolved mode, not the org default

## Dependencies

- 03 (Agent Identity — org-level settings)
- 12 (Policy Engine — uses autonomy mode)

## Completion requirements

- [x] `aiMode` field exists on Chat, Ticket, Project, and Channel models
- [x] Resolution function correctly applies the override hierarchy
- [x] DMs default to `observe`, group chats default to `suggest` when no explicit override
- [ ] UI allows setting per-scope AI mode
- [x] Policy engine uses resolved mode
- [x] Null values correctly fall through to parent/org default

<!-- Implementation notes (PR: per-scope autonomy settings):
- `aiMode: AutonomyMode?` added to Chat, Ticket, Project, Channel in Prisma schema
- `resolveAutonomyMode()` in `services/scope-autonomy.ts` walks: scope → project (most restrictive) → chat-type default → org default
- `updateScopeAiMode()` in same file handles setting/clearing overrides
- GraphQL: `resolvedAiMode` query returns effective mode, `updateScopeAiMode` mutation sets/clears
- Context builder calls `resolveAutonomyMode()` before building permissions
- 12 unit tests cover all resolution scenarios
- UI work is deferred — backend is fully wired but no frontend toggle yet
- Note: mutation does not yet emit events (no `scope_ai_mode_changed` event type exists)
- Note: authorization is org membership only — admin/owner check not yet enforced
-->

## How to test

1. Set org default to `act`, set a specific chat to `observe` — verify the agent only observes in that chat but acts elsewhere
2. Set a project to `suggest` — verify all scopes under that project default to `suggest`
3. Set a chat override that conflicts with the project setting — verify the chat override wins
4. Remove a scope override (set to null) — verify it falls back to project or org default
5. Check a DM with no explicit setting — verify it resolves to `observe`
