# 30 — Motion, Haptics, and Performance Polish Pass

## Summary

A deliberate review pass of every transition, animation, haptic, and real-device performance budget in the app. Tuned on a real device. The goal is to close both the "web-y feel" gap and the "works, but not fast enough" gap that accumulates after feature tickets land. No new product features; exclusively tuning, profiling, and budget enforcement.

## What needs to happen

- Run the app on a real iPhone (ProMotion if available) and systematically step through every screen and every interaction. For each, evaluate:
  - Does this action have a haptic? Is it the right one (per plan §11.6)?
  - Does this animation have the right spring? Too bouncy? Too stiff?
  - Is there a motion cue at all for state changes that currently have none?
  - Any motion that feels decorative rather than functional?
- **Specific targets to review:**
  - Tab switches: `selection` haptic; snap transition
  - Pull-to-refresh: `medium` haptic at trigger threshold
  - List row press: scale + `light` haptic
  - Status chip on change: brief flash / scale
  - Message arrival in stream: fade/slide in from bottom (if near bottom)
  - Typing cursor: opacity loop, 800ms period
  - Tab strip underline: spring layout animation
  - Sheet presentation: default iOS physics (don't customize)
  - Modal dismissals: matched gesture + spring back
  - Button press: `0.98` scale, spring back (`damping: 25, stiffness: 400`)
  - Pending-input bar collapse: fade + height
  - Tab bar: no haptic on scroll; `selection` on tap
  - Keyboard rise: matches keyboard velocity via native `Keyboard.addListener` + `LayoutAnimation.keyboard` (see `SessionSurface` for the pattern)
- **Performance instrumentation and profiling:**
  - Add lightweight instrumentation via `expo-performance` or an equivalent supported tool so we can measure the plan's budgets on-device instead of guessing.
  - Measure cold start, warm start, event-ingest latency, session-stream scroll smoothness, input keystroke latency, and memory usage with a 1000-event session.
  - Fix any hotspots found during profiling: oversized FlashList cells, excessive re-renders, slow markdown blocks, or expensive keyboard/layout work.
  - Capture the before/after numbers in a short internal note linked from the ticket or PR so the team knows the budgets were actually checked.
- Tune spring configs in `theme/motion.ts` based on findings — one file changes, everything inherits.
- Delete any animations that don't communicate state.
- Fix any screens where default RN feel leaked through (flash on touch, missing press state, etc.).

## Dependencies

- All M1–M5 tickets complete.

## Completion requirements

- [ ] Every primary interaction has an appropriate haptic
- [ ] No animation feels decorative; every one communicates state
- [ ] Spring configs tuned on real device, not simulator
- [ ] Cold start, warm start, event ingest, input latency, and memory are measured against the plan's §16 budgets
- [ ] Session stream meets the real-device scrolling target on a 1000-event session, or any miss is explicitly documented with a follow-up
- [ ] No "flat"/web-y transitions remain
- [ ] Internal team dogfood review: 3+ users rate feel as "native" (subjective but explicit)

## How to test

1. On real device, systematically exercise every screen/action.
2. Run the instrumentation pass and record the measured cold start, warm start, event-ingest, input-latency, and memory numbers.
3. Open a 1000-event session and verify scroll performance on a real device.
4. Video-record before/after comparison; diff the feel.
5. Hand device to a non-involved person familiar with iOS; ask "does this feel like a real iOS app?"

## Code-only landing notes

This change lands the parts of the polish pass that can be verified on a
codebase, leaving the on-device-only items for the dogfood loop:

- `theme/motion.ts` is now the single source of truth for spring configs.
  Added `springs.morph.{open,close}` and `durations.accordion`. Adopted by
  `SessionActionsMenu`, `SessionGroupTitleMenu`, `NewActivityPill`,
  `SessionInputComposer`, `ActiveTodoStrip`, `CommandExecutionRow`, and
  `ReadGlobGroup`.
- Added subtle row-press scale (`0.99`) to `HomeSessionRow` and
  `SessionGroupRow` — wide list rows previously only changed background on
  press, which read as web-y. The press now reads as a real touch.
- Filled in the sign-in haptic gaps from §11.6: `light` on press,
  `success` on completed auth, `error` on every failure branch.
- Added `lib/perf.ts` — a lightweight, zero-dependency replacement for
  `expo-performance` that captures cold-start, warm-start, and event-ingest
  samples in a ring buffer (and logs to console under `__DEV__`). Wired into
  `app/_layout.tsx` (cold/warm) and the org/session event subscriptions
  (event-ingest).
- Existing surfaces verified against §11.6 haptics map and the named motion
  targets: tab switches use the native UITabBar selection haptic; the
  composer mode chip uses `selection`; the tab-strip underline uses
  `springs.smooth`; `Button` press uses `springs.snap` (damping 25 /
  stiffness 400) per spec; pull-to-refresh fires `medium` on each list
  screen.
- `SessionStreamList` continues to set `maxItemsInRecyclePool={0}` —
  intentional workaround for the Fabric recycling crash fixed in
  `8c55e3f2`. It costs scroll memory; tracked under "Open follow-ups".

## On-device follow-ups (not in this ticket)

Anything that genuinely needs an iPhone in hand or measurement on real
hardware is explicitly deferred — the `lib/perf.ts` markers exist so these
can be checked without re-instrumentation:

- [ ] Capture cold start, warm start, event ingest, input latency, and
      memory against §16 budgets on an iPhone 13/15 Pro. Record before/after
      numbers. The infrastructure is in place — read samples via
      `recentPerfSamples()` from a dev overlay or `console.log`.
- [ ] Verify 120fps scrolling on a 1000-event session. If a sustained drop
      shows up, revisit the FlashList recycle-pool tradeoff (see crash fix
      in `8c55e3f2`) — it may be possible to re-enable recycling for a
      subset of node types.
- [ ] Tune `springs.morph.{open,close}`, `springs.snap`, and the row-press
      scale on a real device. The values currently match the prior local
      constants; the scale (`0.99`) is a code-only guess that should be
      validated against feel.
- [ ] Internal team dogfood review (3+ users → "feels native").

## Code-only follow-ups surfaced by /review-against-plan

All four gaps the review found are now closed. Each item below describes
the original gap and where the fix lives.

- [x] **Haptic-map drift vs §11.6**: three call sites had the wrong
      strength. Fixed in `useHomeRowMenu.handleStop` (medium → heavy),
      `SessionGroupHeader.archiveGroup` (medium → heavy), and
      `PendingInputPlan.dispatch` (now branches `success` for approve,
      `light` for revise). Also downgraded `SessionGroupHeader.handleCopyLink`
      from `success` to `light` since copy is not a notification-class event.
- [x] **`recordPerf("input-latency", …)` is now wired**. The
      `SessionInputComposer` `onChangeText` callback stamps the keystroke
      start, then samples in `requestAnimationFrame` so the recorded
      duration covers state-set + commit + paint setup — the right shape
      for the §16 <16ms budget.
- [x] **Status chip on change: brief flash**. `Chip` now scales to 1.08
      then springs back to 1 whenever its `variant` changes. Skipped on the
      first render so chips don't pop unsolicited when a list mounts.
- [x] **Message arrival entrance animation**. `SessionStreamList` now
      wraps the _newest_ row in a `FadeInDown` entering animation, gated on
      both `isNearBottomRef.current` (the user is following the bottom) and
      `lastSeenKeyRef !== currentKey` (this is a brand-new last row, not
      a re-render of the same one). A one-frame `acceptEntering` flag also
      suppresses the cascade on initial mount. Compatible with the
      `maxItemsInRecyclePool={0}` Fabric workaround — every row is mounted
      exactly once, so per-row enters fire only on real arrivals.

## Dependency note

The plan README places ticket 30 in M6 with "needs M5 complete". As of the
PR commit, tickets 26–29 (push registration client, server push dispatch,
deep links, badge counts) have not landed on `main`. Ticket 30 has been
worked on with the assumption that those will land before 30 ships, since
none of the polish work depends on push or badging. This is fine but worth
re-checking before this ticket merges — specifically whether the deep-link
entry point (28) brings any new haptics or motion that need to be tuned in
this pass.
