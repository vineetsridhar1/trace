# 31 — Accessibility Audit

## Summary

Close the accessibility gaps accumulated during feature tickets. Primary targets: VoiceOver labels, Dynamic Type support, hit target sizes, color contrast, and focus order. Not ship-blocking if gaps remain, but V1 should pass a reasonable bar.

## What needs to happen

- **VoiceOver labels**: every interactive element must have an `accessibilityLabel`. Audit:
  - IconButtons — already required by primitive API
  - Session rows — label should include name, status, and "double-tap to open"
  - Chips — include status meaning ("needs input", not just color)
  - Send/queue button — dynamic label reflecting current mode
  - Include auth/local-pairing flows, connections accordions, media modals, and expandable tool-result rows in the audit — not just the main session surfaces
- **Accessibility roles**:
  - Buttons have `accessibilityRole="button"`
  - Cards that are tappable have `accessibilityRole="button"`
  - List rows have `accessibilityRole="button"` when tappable
- **Dynamic Type**:
  - Verify every `Text` respects `allowFontScaling` (default on).
  - At largest accessibility type size, no screen clipping or unreadable overlapping.
  - Tab bar still usable.
- **Hit targets**: minimum 44pt × 44pt for every interactive element. Small IconButtons (e.g., the `×` on queued chips) need `hitSlop` expansion.
- **Color contrast**: check text/background pairs against WCAG AA (4.5:1). Especially: mutedForeground on surface backgrounds, chip text on colored backgrounds.
- **Focus order**: when using a hardware keyboard or switch control, focus moves in a sensible top-to-bottom, left-to-right order.
- **Reduce motion**: if `AccessibilityInfo.isReduceMotionEnabled()` is true, replace spring animations with fades, disable the active-status pulse, remove the typing cursor.
  - This includes composer chip / sheet-trigger transitions and other Reanimated enter/exit animations, not only the shared motion helpers.
- Add basic automated accessibility linting via an ESLint plugin if one works well for RN, else just manual review.

## Dependencies

- All M1–M5 tickets complete.

## Completion requirements

- [ ] Every interactive element has an accessibilityLabel
- [ ] No missing roles on buttons/tappable cards
- [ ] Dynamic Type at max size: every screen still usable
- [ ] 44pt minimum hit targets everywhere
- [ ] Reduce Motion respected
- [ ] VoiceOver walkthrough of core flow is coherent

## How to test

1. Enable VoiceOver; swipe through every screen; all focusable elements announced correctly.
   - Explicitly cover sign-in, pair-local, connections, image preview modal, and expandable tool-result rows.
2. Increase Dynamic Type to largest; every screen readable and functional.
3. Enable Reduce Motion in settings; verify animations degrade gracefully.
   - Verify the composer controls and chips stop sliding/springing.
4. Color contrast check via Xcode accessibility inspector.
