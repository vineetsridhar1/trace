# Design workflow

Use this detailed workflow when the request is a new or replacement surface, a design review, or a named design improvement. It adapts Impeccable's design practices to Trace's canvas, manifest, token, and review contracts. It never authorizes installing an external skill, running hooks, or changing the canvas runtime.

## Choose the surface mode

Set `mode` in `design.brief.json` before composing. The mode describes what the visitor must accomplish on this surface, not the overall product category.

- **`persuade`** — the visitor must understand an offer and act. Use a legible promise, credible proof, a visible primary action, and a conversion path that belongs to the product's visual language.
- **`operate`** — the visitor must complete work. Prioritize task sequence, scanability, status, recovery, familiar affordances, and efficient density. Brand expression belongs in the details, not in obstacles to the task.
- **`read`** — the visitor must understand information. Design for reading rhythm, hierarchy, navigation, source trust, and wayfinding before ornament.
- **`experience`** — the visitor is engaging with the work itself. Let the artifact lead from the first viewport and make supporting interface deliberately quiet.

For review, score only the heuristics that apply to the selected mode. A `persuade` or `experience` surface may not need expert shortcuts or help documentation; an `operate` surface almost always needs to make state, recovery, and efficiency visible.

## Establish what is true

Before inventing a direction, inspect the brief, selected design package, tokens, components, assets, representative screens, and supplied references.

- A coherent existing interface is visual authority even without a written design system.
- A local feature or state inherits its surrounding surface; it is not a license to create a second visual identity.
- Preserve confirmed brand elements and product facts. References may inform structure or qualities, but never give permission to copy names, logos, images, copy, or proprietary interaction details.
- When the request is a redesign, preserve the product truth, content requirements, and constraints—but replace the visual world fully. Do not produce a cosmetic blend of a rejected identity and a new one.

## Ask only material questions

If the request leaves an important choice unresolved, ask one compact round of related questions. Do not ask questions that can be safely inferred and never ask for arbitrary CSS values or generic "style preferences."

- **Persuade:** who must act, what should they believe, and what truthful proof or assets earn that belief?
- **Operate:** what task is completed, what information and states matter, how frequently is it performed, and what constraints make it difficult?
- **Read:** what question does the reader bring, what material must be understood, and how should they navigate it?
- **Experience:** what should lead, how should exploration unfold, and which transition or interaction makes the work memorable?

Across modes, establish success, protected constraints, realistic content ranges, important states, accessibility and localization needs, and what would make an otherwise polished result feel wrong.

## Shape before building

For broad work, record a concise brief with:

1. Job, audience, mode, and real usage scene.
2. Primary outcome, action, and truthful proof.
3. Surface scope, flow, states, breadth, and interactivity.
4. Visual authority and the intended design direction.
5. Constraints, anti-goals, responsive intent, and unresolved assumptions.

For a settled, narrow request, use only the information necessary to make the screen. For a multi-screen flow or ambiguous new surface, make these decisions explicit in `design.brief.json` before screen code.

## Make a visual-world decision

Choose the appropriate amount of invention.

- **Extend:** preserve the established visual world and solve only the new purpose, hierarchy, state, interaction, and composition.
- **New surface in an established world:** retain the system but explore different information structures and task sequences before settling on one.
- **New or replacement visual world:** identify the product mechanism, audience scene, cultural context, and the category-default treatment to avoid. Develop several materially distinct directions from the audience's world, not several recolors of the same generic SaaS layout. Select one direction with an honest tradeoff and execute it consistently.

A direction is complete only when it names the composition, information topology, color strategy, type character, spatial rhythm, component behavior, state treatment, and responsive rules. A mood word or palette alone is not a direction.

## Build with an explicit quality bar

Make a complete, product-specific design rather than a safe aggregate of familiar patterns.

- Use a color strategy intentionally: restrained, committed, full palette, or drenched. Use bold page-scale color only when the mode and brief support it.
- Let typography create hierarchy and character. Do not add a display font or decorative treatment without a structural role.
- Use the design system's primitives for repeated controls. Create a new primitive only when the pattern is genuinely reusable.
- Put distinctive effort where the product earns it: a meaningful information visualization, a task-specific control, a truthful proof module, or a signature interaction—not generic icon tiles, blobs, or decoration.
- Design the full state range. Empty, loading, error, success, permission, overflow, selection, confirmation, and first-run states should clarify the actual workflow.
- Preserve platform expectations. Mobile is not compressed desktop; desktop tools need keyboard, hover, focus, density, and escalation behavior where appropriate.

## Targeted improvement actions

Interpret common requests as focused design actions while preserving the brief and surface mode.

| Request | Focus |
| --- | --- |
| Shape or clarify | Resolve user job, task flow, information architecture, copy, and decision points before visual refinement. |
| Critique | Assess product specificity, hierarchy, cognitive load, accessibility, states, and the fit between the surface and its mode. |
| Audit or harden | Check responsive behavior, text overflow, touch targets, loading/error/empty states, focus, contrast, and implementation quality. |
| Polish | Remove visible defects, align to the system, and tighten hierarchy without changing the identity. |
| Bolder or delight | Increase distinctive expression through one coherent visual or interaction decision, never through arbitrary extra effects. |
| Quieter or distill | Remove competing emphasis, simplify choices, and make the primary task or story easier to perceive. |
| Colorize, typeset, or layout | Improve a single design dimension while protecting the established direction and user task. |
| Adapt | Recompose for the target viewport; do not simply shrink the desktop design. |
| Animate | Add motion that explains state, hierarchy, cause and effect, or personality. Respect reduced motion and never make motion the only feedback. |
| Onboard | Make first-run value, activation, empty states, and recovery visible without blocking experienced users. |

## Critique and review

Review the rendered canvas before delivery. Start with independent design judgment, then use the starter's deterministic and browser checks as evidence rather than as a substitute for judgment.

Assess:

1. **Specificity:** could this surface belong to a different product without meaningful change?
2. **Mode fit:** does the composition help the visitor persuade, operate, read, or experience as intended?
3. **Hierarchy and cognitive load:** is the primary action or story visible, are choices manageable, and does each region earn its attention?
4. **Product behavior:** are task states, feedback, recovery, affordances, copy, and realistic data ranges designed rather than implied?
5. **Craft:** are typography, color, spacing, alignment, contrast, focus, touch targets, responsive behavior, and motion intentional?

Run one bounded repair cycle: inspect the representative desktop and mobile artboards together, repair the highest-impact findings in a coherent batch, then confirm once. Do not drift into open-ended micro-polish after the design is already coherent.

## Delivery standard

The final canvas should show a complete reviewable story: the right screens, named states, honest content, a consistent system, and working local prototype interactions. Summarize the selected mode, direction, completed flow, key states, and explicit assumptions. Do not describe this workflow or external tools as the user-facing outcome.
