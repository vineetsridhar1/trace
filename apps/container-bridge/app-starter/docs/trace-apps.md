# Building an app in Trace

This project runs in an isolated Trace app session. The user works with you through a conversation
while the app appears beside it as a live preview.

## How the experience works

- File changes appear in the preview automatically through hot reload.
- The user can select parts of the preview to point you toward a specific interface element.
  Preserve existing `data-trace-source` attributes and add them to meaningful new sections.
- Trace stores the app in its configured managed repository so the user can publish and share it.
- Describe results in user terms. Trace already exposes the code and runtime when technical detail
  is useful.

## Project map

- `src/App.tsx` is the main React interface.
- `src/index.css` contains global styles and Tailwind directives. Keep both its import in
  `src/main.tsx` and its link in `index.html`: the import provides Vite transformation and hot
  reload, while the link keeps embedded previews styled if JavaScript style injection is lost.
- `src/components/ui` contains reusable shadcn-compatible interface components.
- `server.ts` serves the app and contains same-origin `/api` routes.
- The app uses Vite, React, TypeScript, Tailwind CSS, Express, and pnpm.

Keep browser requests to this app same-origin. Put calls that require secrets or would be blocked by
browser CORS behind a route in `server.ts` or another server module. Never send secrets to the
browser or commit them.

## Connected data

When the user asks for connected data, run `"$TRACE_CLI" integration --help --json` and follow its
workflow. Use leaf help for exact effects and arguments, then run `integration list --json`. The live
catalog tells you which integrations and least-privilege capabilities are available, whether
accounts are connected, what the current app can access, and the exact server helper to use. Do not
send the user to the manual Data access UI, guess Nango keys, call Trace GraphQL directly, or put
binding UUIDs in generated code.

Call integrations only from server routes. Trace attaches the current signed-in viewer to proxied
`/api/*` requests, and the server-only `trace` helper passes that identity to Trace without exposing
credentials to browser code.

For example, a GitHub route only needs the integration name and provider path:

```ts
app.get("/api/github-user", async (request, response) => {
  const user = await trace.integrations.request(request, "github", {
    path: "/user",
  });
  response.json(user);
});
```

For a Snowflake binding, keep the SQL in the Node route and accept only its parameter values from
the browser:

```ts
import { trace } from "./trace.js";

app.get("/api/revenue", async (request, response) => {
  const rows = await trace.integrations.snowflake.query(request, "snowflake", {
    sql: "SELECT region, SUM(revenue) FROM analytics.sales WHERE sold_at >= ? GROUP BY region",
    parameters: [String(request.query.startDate)],
  });
  response.json(rows);
});
```

Use the stable integration ID returned by `integration list`; generated code never needs a binding
UUID or Nango configuration key. Trace accepts one read-only `SELECT` statement, resolves the
binding's viewer/shared/service connection, and sends the request through Nango. Do not accept SQL,
binding IDs, database names, schema names, warehouse names, or connection identifiers from browser
input.

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
- Confirm an intentional computed style in the browser; a successful build alone does not prove
  that the stylesheet loaded.
- Check narrow and wide layouts and basic keyboard navigation.
- Remove placeholder actions and make empty, loading, success, and error states understandable.
- Commit and push the finished app once it is working.
