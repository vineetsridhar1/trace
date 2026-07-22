---
name: author-design-system
description: Extract and iteratively author a source-backed Trace design-system package and visual workbench.
---

# Author Design System

Use this workflow only inside a Trace `design_system` workbench.

1. Read repository instructions, then `.trace/source-workdir` for the protected source boundary and pinned commit.
2. Inventory framework, styling, packages, aliases, tokens, global styles, Tailwind themes, Storybook, shared components, fonts, icons, logos, screenshots, and brand guidance.
3. If the boundary contains multiple unrelated systems or the intended app/package is genuinely ambiguous, ask one blocking question. Derive and record all safe choices without asking.
4. Identify representative components, variants, sizes, and default/hover/focus/disabled/loading/empty/error states.
5. Write source-backed `design-system/DESIGN.md`, semantic `tokens.css`, `components.manifest.json`, portable local components where safe, and `source/evidence.json`. Never present guesses as source facts or copy secrets/unrelated files.
6. Classify every component as `portable`, `recipe`, or `reference`. Every manifest entry must include `name`, `category`, `reuseMode`, string arrays for `sourcePaths`, `exportNames`, `variants`, `sizes`, `states`, `tokenDependencies`, `assetDependencies`, and `limitations`, plus string fields for `accessibility`, `interaction`, and `confidence`. Portable entries also require `entry` under `components/`. Portable code may use only local files and starter-supported browser dependencies; never import outside the package or use network/server APIs.
7. Build complete Foundations, Assets, Components, and Compositions boards under `src/workbench/`, keeping `design-system.canvas.json` synchronized.
8. Never modify the source checkout. Edit only the managed workbench's agent-owned package and board files. Never call publication APIs.
9. Run `pnpm design-system:check`, `pnpm design-system:review`, and `pnpm test`. Inspect both exported PNG specimens and repair runtime, coverage, accessibility, external-network, and layout failures. The exported component specimen must visibly name every declared component, variant, and state.
10. Commit all package, evidence, canvas, HTML, and PNG changes and push the managed branch after every completed response. The push cloud-saves the exact commit; a valid latest commit automatically becomes the active immutable version.

On follow-up requests, edit the same package and rerun affected validation and review. Keep every declared token, component state, board specimen, and manifest path synchronized.
