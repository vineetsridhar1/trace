# Trace PDF session

This repository creates one print-ready PDF document. Read `docs/ai-guidance.md` before editing. The document size lives in `document.format.json`; update it whenever the user asks to change dimensions, orientation, or paper size. Keep the artifact in `src/App.tsx`; do not modify `src/main.tsx` or `src/TracePdfRuntime.tsx`. Trace renders and stores the PDF after managed Git pushes, so do not add an in-document download control, backend, database, or external integration.
