<!-- Adapted from Impeccable and modified for Trace's shared React App and Design workflows; provider-specific tooling was removed. -->

# Interface critique

Critique is diagnosis, not automatic permission to edit. Judge the rendered experience independently before reading automated output or implementation details.

## Contents

- [Set the review frame](#set-the-review-frame)
- [Run independent passes](#run-independent-passes)
- [Assess the experience](#assess-the-experience)
- [Assess resilience and accessibility](#assess-resilience-and-accessibility)
- [Score without hiding judgment](#score-without-hiding-judgment)
- [Write actionable findings](#write-actionable-findings)
- [Finish the critique](#finish-the-critique)

## Set the review frame

Resolve:

- target surface, flow, state, and representative viewports;
- audience, visitor mode, primary job, and success condition;
- user-supplied references and protected constraints;
- whether the work is an extension, refinement, or redesign;
- what is explicitly outside scope.

Inspect the active design system, product context, and relevant source only after understanding the rendered target. In Design sessions, judge each declared artboard at its target viewport; exclude canvas chrome, zoom, scaling, labels, and neighboring artboards. In App sessions, inspect the live route and actual interaction path.

## Run independent passes

Keep these passes separate until synthesis so one kind of evidence does not anchor the others.

### Pass A: design-director judgment

Ignore implementation convenience. Ask:

- Is the product and audience recognizable, or could this belong to anything?
- Does the selected mode fit the surface's job?
- Is there a clear point of view expressed through structure, type, color, material, and behavior?
- Does the first viewport establish the right promise, task, or reading path?
- Is the primary action or decision obvious without flattening all hierarchy?
- Does the work feel coherent across screens, states, and responsive sizes?
- Is anything visually impressive but operationally wrong?
- Is anything familiar because it is useful, or merely because it was the default?

### Pass B: task and information architecture

Walk the main path as the target user. Ask:

- Can the user predict where to begin and what happens next?
- Does navigation match the user's mental model and current location?
- Are labels, controls, and disclosure ordered by real decisions?
- Are required inputs separated from optional complexity?
- Are destructive, irreversible, permissioned, or expensive actions explicit?
- Can the user recover from cancellation, error, timeout, or a wrong turn?
- Are empty and loading states part of the path rather than isolated illustrations?
- Do expert shortcuts coexist with a comprehensible default path?

### Pass C: craft and system coherence

Inspect:

- typography roles, measure, wrapping, numeric treatment, and fallback behavior;
- spacing rhythm, grouping, grid, optical alignment, density, and container logic;
- semantic color roles, contrast, theme behavior, and non-color cues;
- component vocabulary, state consistency, icon family, and asset quality;
- motion purpose, timing, interruption, reduced-motion behavior, and performance;
- whether custom treatments extend the system or create one-off drift.

### Pass D: native checks

Run only the checks and review commands the workspace provides. Record what they can and cannot observe. A passing check cannot prove hierarchy, specificity, emotional fit, or task clarity. An automated finding is evidence to verify, not an automatic defect.

## Assess the experience

### Specificity

Look for product-specific modules, data shapes, language, workflows, and evidence. Flag generic scaffolds that could be relabeled for another category: interchangeable card grids, decorative metric tiles, feature-icon rows, unexplained gradients, arbitrary glass, or imagery disconnected from the task.

### Hierarchy

Apply the squint test. Blur detail and identify the first, second, and third elements perceived. Compare that order with product priority. Check whether size, weight, space, position, contrast, and motion reinforce one another or compete.

### Cognitive load

Distinguish necessary complexity from avoidable complexity. Flag:

- equal emphasis across unequal choices;
- repeated explanations or controls;
- premature options before the user has context;
- hidden dependencies between fields or steps;
- excessive containers masking weak grouping;
- terminology that requires memorization;
- repeated confirmations that do not protect meaningful risk.

### Interaction quality

Check affordance, feedback, and reversibility:

- interactive elements look and behave interactive;
- hover, focus, active, selected, disabled, loading, success, and error are coherent;
- optimistic behavior has honest recovery;
- overlays, menus, and dialogs preserve focus and escape paths;
- state changes are visible without relying only on color;
- animation explains cause or relationship rather than delaying the task.

### Emotional and brand fit

Ask whether tone matches the user's context: urgent, careful, celebratory, technical, intimate, or routine. Check copy, motion, density, imagery, and color together. A polished interface can still be emotionally inappropriate.

## Assess resilience and accessibility

Review representative extremes:

- minimum, typical, maximum, missing, malformed, and localized content;
- long names, large values, multiple lines, text zoom, and font fallback;
- empty, loading, partial, stale, offline, permission, rate-limit, and server-error states;
- keyboard order, semantic controls, accessible names, visible focus, and escape behavior;
- touch targets, coarse pointers, hover absence, and on-screen keyboards;
- contrast for text, controls, icons, focus indicators, overlays, and imagery;
- narrow, intermediate, wide, portrait, landscape, and container-constrained layouts;
- reduced motion, slow hardware, slow network, and interrupted operations.

Do not claim production accessibility from a static mock. In a Design session, specify the intended semantic and interaction behavior visibly enough for implementation handoff.

## Score without hiding judgment

Use scores only to make priorities comparable. Never average away a blocked task.

Suggested dimensions, each 0–4:

| Dimension | 0 | 2 | 4 |
| --- | --- | --- | --- |
| Product specificity | Generic or misleading | Some domain fit | Unmistakably this product and audience |
| Task clarity | Primary task blocked or obscure | Path works with friction | Path is immediate, predictable, and recoverable |
| Hierarchy | No stable reading order | Mostly clear with competition | Priority is unmistakable across states and sizes |
| System coherence | Conflicting patterns | Mostly consistent | Tokens, components, states, and details form one system |
| Accessibility | Major exclusion | Partial coverage | Keyboard, semantics, contrast, scaling, and non-color cues hold |
| Resilience | Perfect-data mock only | Common states covered | Extremes, failures, permissions, and responsive contexts hold |
| Craft | Visibly unfinished | Competent but generic | Deliberate, refined, and appropriately distinctive |

Report any P0 or P1 separately from scores:

- **P0:** blocked primary task, destructive data loss, or critical security deception.
- **P1:** major usability or accessibility failure affecting the main path.
- **P2:** meaningful friction, inconsistency, or missing resilience.
- **P3:** visible polish issue with limited task impact.

## Write actionable findings

For each finding include:

1. **Priority and title** — name the failure, not the desired solution.
2. **Evidence** — viewport, screen, state, element, and observable behavior.
3. **User impact** — who is affected and what becomes harder, slower, risky, or impossible.
4. **System cause** — hierarchy, content, layout, component, state, or implementation source.
5. **Repair direction** — a concrete outcome with protected constraints.
6. **Verification** — the evidence that would demonstrate the repair worked.

Avoid vague findings such as “make it cleaner,” “improve UX,” or “increase contrast.” Prefer: “At 390px, the destructive secondary action wraps above the primary save action, reversing decision priority; keep save first in visual and focus order and move deletion behind the overflow menu.”

Separate facts from interpretations. Mark assumptions. Do not invent user research, analytics, browser behavior, or product requirements.

## Finish the critique

Synthesize the passes into:

- a one-paragraph verdict on mode fit, product specificity, and task clarity;
- the three highest-impact findings in priority order;
- secondary findings grouped by system area;
- strengths worth protecting during repair;
- explicit unknowns and out-of-scope observations;
- the recommended repair sequence and verification plan.

Do not edit unless the user asked for critique-and-fix. When repair is authorized, fix related findings in coherent batches, then rerun the full affected path rather than checking only the changed component.
