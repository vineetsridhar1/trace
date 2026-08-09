# Trace live variation mode

Trace Design workspaces are always React + Vite and already render through a live HMR canvas. Do not install or inject Impeccable's standalone live overlay.

Use the current canvas as the live comparison surface:

1. Identify the selected screen or element from the user's request and its `data-trace-source` owner.
2. Preserve the original artboard unless the user explicitly asked for an in-place refinement.
3. Create two or three materially different variation screens under `src/design/screens/`, using the relevant Impeccable action reference and `craft-floor.md`.
4. Register the variations beside the original in the same `design.canvas.json` section. Give each a stable id and a concise `variation` label describing the design idea, not "Option 1."
5. Keep viewport, state, content, and product facts constant so the comparison isolates the design decision.
6. Let Vite HMR update the existing canvas. Do not start another server or edit `src/App.tsx`, `src/canvas/`, Vite, or export configuration.
7. Run `pnpm design:check`, visually inspect the comparison, and repair obvious defects before presenting it.

When the user chooses a variation, retain the chosen screen as the canonical version, remove only the superseded variation artboards created for that comparison, update the manifest, and rerun the required checks.
