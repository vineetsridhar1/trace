# Trace Design-System Workbench

The source checkout path and pinned commit are recorded in `.trace/source-workdir`. It is read-only. Never modify it. Edit only `design-system/`, `design-system.canvas.json`, and `src/workbench/`. Keep package files, boards, variants, states, compositions, evidence, and previews synchronized. Run `pnpm design-system:check`, `pnpm design-system:review`, and `pnpm test`, inspect both PNG specimens, then commit and push after every completed response. A push cloud-saves a draft; only the user can publish with Save.
