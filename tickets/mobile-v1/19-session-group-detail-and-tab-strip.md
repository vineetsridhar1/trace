# 19 — Session Group Detail Screen and Tab Strip

## Summary

The session group detail screen is a thin wrapper that immediately routes the user into the most-recent session in the group, with a tab strip at the top to switch between sibling sessions if the group has multiple. The session stream itself is the next ticket — this delivers the group shell, tab strip, header, and overflow menu.

## What needs to happen

- `app/(authed)/sessions/[groupId].tsx` (<150 lines):
  - Read `groupId` from params.
  - Query `sessionGroup(id)` on mount (provides sibling sessions + checkpoints).
  - If param path is just `/sessions/[groupId]`, redirect to `/sessions/[groupId]/[latestSessionId]` where latest = sibling session with highest `_sortTimestamp`.
  - Compose: `SessionGroupHeader` + `SessionTabStrip` (only if >1 sibling) + child route (session stream).
- `SessionGroupHeader.tsx` (<150 lines):
  - Group name (large), branch (monospace, muted)
  - PR status chip (if `prUrl`): "PR open" / "PR merged" / "PR closed"
  - Overflow `IconButton` (`ellipsis.circle`): native context menu with:
    - "Open PR" (if `prUrl`) → `Linking.openURL(prUrl)`
    - "Archive workspace" → `archiveSessionGroup` mutation (with confirmation)
    - "Copy link" → `Clipboard.setStringAsync('trace://sessions/' + groupId)`
  - Liquid Glass background (collapses to solid when content scrolls under)
- `SessionTabStrip.tsx` (<150 lines):
  - Horizontal scrolling pill strip
  - Each pill shows session name, small status dot
  - Active pill has accent tint + animated underline indicator (Reanimated layout animation)
  - Tap pill: navigates to `/sessions/[groupId]/[sessionId]`
  - Only shown if sibling count > 1
- Session events subscription lives on the session stream itself (next ticket), not here.

## Dependencies

- [17 — Session Groups List](17-coding-channel-session-groups.md)
- [13 — Data Primitives (Chip, StatusDot)](13-data-primitives.md)
- [12 — Glass](12-surface-primitives-glass-sheet.md)

## Completion requirements

- [x] Landing on `/sessions/[groupId]` auto-routes to latest session
- [x] Header renders name, branch, PR chip
- [~] Overflow menu functions: open PR, archive, copy link — wired, but the `IconButton` context menu opens on long-press only because `dropdownMenuMode` is not propagated to `ContextMenu`; overflow buttons must tap-to-open (see "Follow-ups" below)
- [x] Tab strip only appears with >1 session
- [x] Tab switching animates the underline indicator
- [x] All files <200 lines (largest: `SessionGroupHeader.tsx` at 192 lines)
- [ ] Header pins to the top (current implementation places the header inside the `ScrollView` so it scrolls away; see "Follow-ups" below)

## Follow-ups discovered during implementation

The shell landed but surfaced two issues that must be resolved before ticket 20 builds on top of it. Ticket 20 will restructure the screen around `FlashList`, so these need to be fixed as part of that ticket (or a small pre-20 patch) so the stream can be composed on a working shell:

1. **Overflow menu tap-to-open.** `IconButton` wraps its `Pressable` in `react-native-context-menu-view`'s `ContextMenu`, which opens on long-press unless `dropdownMenuMode` is set. The overflow affordance (`ellipsis.circle`) must open on tap — the fix is either to expose `dropdownMenuMode` on `IconButton` or render the context menu with `dropdownMenuMode` directly in `SessionGroupHeader`.
2. **Header pinning + native large-title decision.** The plan (§10.5 Polish) called for "native iOS large-title behavior via `react-native-screens`," but this ticket added a custom Liquid Glass header. The current code does neither well: the custom header is inside the `ScrollView` so `solid={true}` never meaningfully differs from `solid={false}`, and `Glass preset="pinnedBar"` isn't actually pinned. Ticket 20 should choose one: either (a) drop the custom header and use `headerLargeTitle: true` on `sessions/_layout.tsx` (matching `(tabs)/channels/_layout.tsx` and `(tabs)/(home)/_layout.tsx`), with `SessionTabStrip` living in a pinned header accessory; or (b) pull the custom header out of the scroll view, stack it above `FlashList`, and drive `solid` from `FlashList`'s scroll offset. Picking (a) also collapses the "group name in native header + group name in custom header" duplication we have today.

## How to test

1. Navigate from coding channel → session group with 1 session → lands directly on session stream (ticket 20+ will show real content).
2. Navigate to a group with 2+ sessions → tab strip visible, underline on active; tap other → switches.
3. Overflow menu → Copy link → paste → `trace://sessions/...`.
4. Overflow → Archive → confirms → archives (verify in web).
