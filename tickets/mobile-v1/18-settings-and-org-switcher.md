# 18 — Settings Screen and Org Switcher Sheet

## Summary

A minimal settings screen: user info, active org switcher (opens native sheet), sign-out. No theme toggle, no notification preferences, no profile edit — all out of scope for V1.

## What needs to happen

- `app/(authed)/(settings)/index.tsx` (<150 lines — the route group `(settings)` hosts the tab's `Stack` per ticket 15's native-tab layout):
  - User row at top: `Avatar` + name + email. Tap: no-op for V1.
  - "Active organization" `ListRow`: shows current org name, chevron right. Tap: opens org switcher sheet.
  - "Sign out" `ListRow`: destructive variant. Tap: opens confirmation sheet (simple native alert-style). Confirm: clears Keychain token, clears entity store, navigates to `(auth)/sign-in`.
  - Footer: app version + build number (from Expo constants), tiny footnote caption.
  - Dev-only: in `__DEV__`, show an extra ListRow "Design System" linking to `/(dev)/design-system`.
- Org switcher sheet (`app/sheets/org-switcher.tsx` + `OrgSwitcherContent.tsx`):
  - Sheet routes live at `app/sheets/` (root-level), not under `(authed)/`. Nesting sheets inside the native tab navigator causes expo-router to treat `sheets` as a tab and prevents the native sheet presentation from layering correctly over the tabs. The auth guard is re-applied inside `sheets/_layout.tsx`.
  - Presented as native iOS sheet with `.medium` detent via expo-router's modal presentation.
  - Uses `Sheet` layout primitive.
  - Lists each membership as a `ListRow`: org name, role subtitle, checkmark on active.
  - Tap row: `setActiveOrg(id)` from client-core, then `recreateClient()` from `@/lib/urql` so the WS handshake re-sends `X-Organization-Id`, then `useEntityStore.getState().reset()` and `useMobileUIStore.getState().reset()` to drop stale entities. Haptic `selection`, dismiss sheet. The hydration hook (ticket 09) re-runs because `activeOrgId` changed and handles resubscription.
  - **Replaces** the placeholder sheet at `apps/mobile/src/components/auth/OrgSwitcherSheet.tsx` introduced by ticket 09. Move the org-switch + sign-out logic into the new component and delete the placeholder.

## Dependencies

- [09 — Sign-in Flow (for setActiveOrg and signOut)](09-sign-in-flow-and-hydration.md)
- [12 — Sheet Primitive](12-surface-primitives-glass-sheet.md)
- [13 — ListRow, Avatar](13-data-primitives.md)

## Completion requirements

- [x] Settings renders user info + active org + sign out
- [x] Org switcher sheet presents with native iOS detent
- [x] Switching org rehydrates the store (visible: channels change)
- [x] Sign out clears state and returns to sign-in
- [x] All files <200 lines

## How to test

1. Open Settings — see name, email, active org, sign-out.
2. Tap active org → sheet appears with medium detent, lists orgs.
3. Select different org → sheet dismisses, channel list updates.
4. Tap Sign out → confirmation → returns to sign-in; relaunch shows sign-in (token cleared).
