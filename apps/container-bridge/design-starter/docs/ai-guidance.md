# Trace Design Session

Edit `design.canvas.json` and files under `src/design/`. Do not edit `src/canvas/` unless the user explicitly asks to change the canvas itself.

- Keep one default-exported React component per logical screen in `src/design/screens/`.
- Register every screen in `design.canvas.json` with a stable, unique id and a component path shaped like `./screens/Name.tsx`.
- Put every screen id in exactly one section. Sections determine grouping and ordering.
- Use `variation` and `state` labels for related alternatives such as Default, Loading, Empty, and Error.
- Set the viewport and optional section-relative position in the manifest. Do not implement a second canvas or iframe.
- Use local assets, data URLs, or CSS-drawn visuals. The HTML exporter rejects network or local asset references that cannot be embedded.
- Preserve the stable canvas runtime. It provides pan, zoom, fit, focus, labels, per-screen error boundaries, HMR, and whole-canvas HTML export.

The managed Vite server is already running on port 3000. Edit source files and let HMR update the preview; never start another dev server.
