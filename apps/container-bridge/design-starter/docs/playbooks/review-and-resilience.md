# Review and resilience

Use this for critique, hardening, onboarding, and the final delivery pass.

## Review order

1. Judge the rendered design before reading detector output: product specificity, mode fit, hierarchy, information architecture, emotional fit, and whether the primary path is understandable.
2. Run `pnpm design:check` for the artifact contract and deterministic Impeccable findings.
3. Run `pnpm design:review`, inspect every screenshot and `.trace/review/report.json`, then verify interactions in the existing Vite canvas.
4. Synthesize evidence. A clean detector is not proof of quality; a detector finding is not automatically a real defect.

Prioritize findings as P0 blocked task or data loss, P1 major usability/accessibility failure, P2 meaningful friction, and P3 visible polish. Report the problem, user impact, location, and concrete repair.

## Resilience checklist

- Default, hover, focus, active, disabled, loading, empty, error, success, selected, permission, and confirmation states where relevant.
- Minimum, typical, maximum, missing, and malformed content; long names, translations, large values, and text zoom.
- Keyboard order and escape paths, semantic controls, accessible names, visible focus, non-color cues, and contrast.
- Mobile touch targets of at least 44px; no accidental overflow or clipped content.
- Responsive recomposition at representative mobile, intermediate, and wide viewports.
- Clear errors that name the problem and recovery; no invented production behavior.
- Motion that is interruptible, performant, and meaningfully adapted for reduced motion.
- Honest empty states that explain what belongs there, why it matters, and the next useful action without forcing ceremony.

## Bounded finish

Inspect representative desktop and mobile artboards together, repair the highest-impact findings in one coherent batch, then confirm once. Finish when the flow is complete, the design system is coherent, required states are present, and no visible defect undermines review. Do not spend open-ended cycles on imperceptible micro-adjustments.
