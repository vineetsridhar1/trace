<!-- Adapted from Impeccable and modified for Trace's shared React App and Design workflows; provider-specific tooling was removed. -->

# Review and resilience

Use this for critique, hardening, onboarding, and the final delivery pass.

## Review order

1. Judge the rendered design before reading detector output: product specificity, mode fit, hierarchy, information architecture, emotional fit, and whether the primary path is understandable.
2. Run the session's native artifact checks and review command; do not invent a generic detector or command that the workspace does not provide.
3. Inspect every rendered viewport or screenshot. In an App session, verify the live responsive route and interactions. In a Design session, judge each declared artboard at its target viewport and exclude canvas chrome, zoom, scaling, and neighboring artboards.
4. Synthesize the visual, interaction, accessibility, and contract evidence. A passing automated check is not proof of design quality.

Prioritize findings as P0 blocked task or data loss, P1 major usability/accessibility failure, P2 meaningful friction, and P3 visible polish. Report the problem, user impact, location, and concrete repair.

## Resilience checklist

- Default, hover, focus, active, disabled, loading, empty, error, success, selected, permission, and confirmation states where relevant.
- Minimum, typical, maximum, missing, and malformed content; long names, translations, large values, and text zoom.
- Keyboard order and escape paths, semantic controls, accessible names, visible focus, non-color cues, and contrast.
- Mobile touch targets of at least 44px in implemented apps and appropriately sized mobile design specs; no accidental overflow or clipped content.
- Responsive recomposition at representative mobile, intermediate, and wide viewports.
- Clear errors that name the problem and recovery; no invented production behavior.
- Motion that is interruptible, performant, and meaningfully adapted for reduced motion.
- Honest empty states that explain what belongs there, why it matters, and the next useful action without forcing ceremony.

## Bounded finish

Inspect representative desktop and mobile evidence together, repair the highest-impact findings in one coherent batch, then confirm once. Finish when the flow is complete, the design system is coherent, required states are present, and no visible defect undermines review. Do not spend open-ended cycles on imperceptible micro-adjustments.
