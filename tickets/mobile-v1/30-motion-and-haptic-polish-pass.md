# 30 — Motion and Haptic Polish Pass

## Summary

A deliberate review pass of every transition, animation, and haptic in the app. Tuned on a real device. The goal is to close the "web-y feel" gap — the places where functional-but-not-polished choices accumulated during feature tickets. No new features; exclusively tuning.

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
- Tune spring configs in `theme/motion.ts` based on findings — one file changes, everything inherits.
- Delete any animations that don't communicate state.
- Fix any screens where default RN feel leaked through (flash on touch, missing press state, etc.).

## Dependencies

- All M1–M5 tickets complete.

## Completion requirements

- [ ] Every primary interaction has an appropriate haptic
- [ ] No animation feels decorative; every one communicates state
- [ ] Spring configs tuned on real device, not simulator
- [ ] No "flat"/web-y transitions remain
- [ ] Internal team dogfood review: 3+ users rate feel as "native" (subjective but explicit)

## How to test

1. On real device, systematically exercise every screen/action.
2. Video-record before/after comparison; diff the feel.
3. Hand device to a non-involved person familiar with iOS; ask "does this feel like a real iOS app?"
