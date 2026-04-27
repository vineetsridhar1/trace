# Contributing

Thanks for helping improve Trace.

## Development Setup

1. Install Node.js 22+ and pnpm 10+.
2. Run `pnpm install`.
3. Copy `.env.example` to `apps/server/.env` and fill in local values.
4. Run `pnpm db:migrate`, `pnpm db:generate`, and `pnpm gql:codegen`.
5. Start development with `pnpm dev`.

## Pull Requests

- Keep changes focused and scoped to the issue being addressed.
- Run `pnpm format:check`, `pnpm lint:eslint`, `pnpm lint`, `pnpm test`, and
  `pnpm build` before requesting review.
- Do not commit generated secrets or local `.env` files.
- Put business logic in the service layer. GraphQL resolvers should stay thin.
- Update tests when behavior changes.

## Enterprise Dependencies

The web app can use AG Grid Enterprise when `VITE_AG_GRID_LICENSE_KEY` is provided
at build time. Do not commit the license key. Public development still works
without the key, but production deployments should provide it as a GitHub Actions
secret or equivalent CI secret.
