# Animation artifact guidance

## Artifact contract

- Build one interactive motion piece in `src/Animation.tsx`, exported as `Animation` and rendered by `src/main.tsx`. Do not modify `src/main.tsx`.
- Use `framer-motion` for animation and interaction (spring transitions, gestures, `AnimatePresence` for enter/exit). Prefer it over raw CSS keyframes so the result stays declarative and easy to reason about.
- The user will click, hover, and drag inside the live preview — build for real interaction, not a passive loop. Respond to pointer and keyboard input where it makes sense for the concept.
- This is a standalone motion piece, not a product screen or a full app. Do not add routing, a backend, a database, or external integrations.
- Keep `src/Animation.tsx` self-contained (React, framer-motion, Tailwind classes, and small local helpers only). The user's stated goal is to copy this file into their own codebase afterward — avoid dependencies or file-spanning state that would make that harder than pasting one component.
- Do not stop, restart, or replace the managed dev server. It is already running on port 3000; edit files and let Vite's HMR update the preview.
- Do not add server routes, databases, authentication, network calls, or package dependencies unless the interaction truly needs them.

## Workflow

1. Resolve the concept: what triggers the motion (load, hover, click, drag, scroll), and what should it communicate or feel like.
2. Make a valid first change quickly, then refine timing, easing, and states in small batches.
3. Run `pnpm review` to drive the live preview headlessly, trigger the interaction, and capture before/after screenshots to `.trace/review/` — then use your Read tool on those PNG files to actually look at the result. playwright-core and a system Chromium are already installed for this; do not install your own browser or automation tooling.
4. Run `pnpm test` before delivery.
