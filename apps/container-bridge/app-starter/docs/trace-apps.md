# Building an app in Trace

This project runs in an isolated Trace app session. The user works with you through a conversation
while the app appears beside it as a live preview.

## How the experience works

- File changes appear in the preview automatically through hot reload.
- The user can select parts of the preview to point you toward a specific interface element.
  Preserve existing `data-trace-source` attributes and add them to meaningful new sections.
- Trace saves meaningful checkpoints to the configured managed repository. The user can restore,
  publish, and share the app from Trace.
- Describe results in user terms. Trace already exposes the code and runtime when technical detail
  is useful.

## Project map

- `src/App.tsx` is the main React interface.
- `src/index.css` contains global styles and Tailwind directives.
- `src/components/ui` contains reusable shadcn-compatible interface components.
- `server.ts` serves the app and contains same-origin `/api` routes.
- The app uses Vite, React, TypeScript, Tailwind CSS, Express, and pnpm.

Keep browser requests to this app same-origin. Put calls that require secrets or would be blocked by
browser CORS behind a route in `server.ts` or another server module. Never send secrets to the
browser or commit them.

## Runtime

Trace manages the development server on port 3000. Do not run `pnpm dev` or start another server.
Edit files directly; use `curl http://localhost:3000` when you need a quick runtime check.

PostgreSQL and Redis are already available:

- Use PostgreSQL for app data that must survive server restarts. Read `DATABASE_URL` as-is and pass
  it to `new Pool({ connectionString: process.env.DATABASE_URL })` from `pg`.
- Redis is available through `REDIS_URL` for caching and temporary coordination.
- Do not install, initialize, reconfigure, or create roles for either service.

The in-memory notes example in `server.ts` is only a starter demonstration. Replace it with durable
storage when the user's app needs to retain information.

## Before finishing

- Exercise the main user flow in the live preview.
- Run `pnpm typecheck` and `pnpm build` after substantial changes.
- Check narrow and wide layouts and basic keyboard navigation.
- Remove placeholder actions and make empty, loading, success, and error states understandable.
- Commit and push a meaningful checkpoint once the app is working.
