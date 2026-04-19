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
  - Keyboard rise: matches keyboard velocity (via `react-native-keyboard-controller`)
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
