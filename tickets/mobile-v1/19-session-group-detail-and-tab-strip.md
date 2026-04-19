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
- [11a — IconButton SF Symbols + Context Menu](11a-iconbutton-sf-symbols-context-menu.md) — overflow menu relies on the `menuItems` prop
- [13 — Data Primitives (Chip, StatusDot)](13-data-primitives.md)
- [12 — Glass](12-surface-primitives-glass-sheet.md)

## Completion requirements

- [ ] Landing on `/sessions/[groupId]` auto-routes to latest session
- [ ] Header renders name, branch, PR chip
- [ ] Overflow menu functions: open PR, archive, copy link
- [ ] Tab strip only appears with >1 session
- [ ] Tab switching animates the underline indicator
- [ ] All files <200 lines

## How to test

1. Navigate from coding channel → session group with 1 session → lands directly on session stream (ticket 20+ will show real content).
2. Navigate to a group with 2+ sessions → tab strip visible, underline on active; tap other → switches.
3. Overflow menu → Copy link → paste → `trace://sessions/...`.
4. Overflow → Archive → confirms → archives (verify in web).
