# Session Brief: Provider Usage and Quotas

## Assignment

Add a normalized, on-demand view of coding-provider plan usage and quota windows. This is distinct
from Trace's per-session token counters: it answers questions such as “How much of my Codex weekly
allowance remains?” without exposing provider credentials or raw provider responses.

Before changing code, read the repository's `AGENTS.md`, inspect the current implementations named
below, and follow current architecture if filenames or contracts have evolved.

## Product example

In coding-tool settings or the model picker, a user can open a usage panel:

- Codex: Plus; five-hour window 42% used, resets in 1h 18m; weekly window 71% used
- Claude: unavailable because this runtime is not authenticated
- Cursor: provider does not expose a supported quota source

The same normalized data should be available as `trace provider usage [provider] --json` once the
CLI foundation exists.

## Current Trace and Paseo context

- Trace sessions already record input/output/cache token usage and cost-like session metrics. Keep
  those metrics; provider plan quotas are a different source and lifecycle.
- Provider credentials may live on a local desktop/runtime, in server secrets, or in provider CLI
  state. The fetch must run at the credential boundary rather than copying credentials centrally.
- Paseo's reference implementation is under
  `/Users/vineet/programming/paseo/packages/server/src/services/quota-fetcher/` and normalizes
  provider, status, plan, windows, balances, and details. Use it as behavioral reference, not code to
  copy blindly.

## Required design

1. Define a provider-neutral result containing provider identity, status, optional plan label,
   percentage/amount windows, reset times, optional balances, fetched-at time, and safe diagnostic
   code/message. Represent unsupported and unauthenticated explicitly.
2. Put each provider-specific fetcher behind an adapter. Provider endpoints, response parsing, CLI
   commands, and credential lookup must not leak into GraphQL resolvers or shared UI code.
3. Route the request to the runtime or server location that already owns the credential. Do not send
   local provider tokens to the Trace central server just to simplify fetching.
4. Fetch on demand when a settings panel/tooltip opens or the CLI command runs. Add request
   deduplication, a short bounded cache, timeout, cancellation, and manual refresh. Do not poll all
   users continuously.
5. Return normalized values only. Redact raw errors, headers, account identifiers, cookies, tokens,
   and full provider payloads from responses and telemetry.
6. Implement only providers with a maintainable, legitimate source available in the current Trace
   runtime. Unsupported providers must degrade cleanly. Start with Codex and Claude if both can be
   implemented safely, then add other existing Trace tools only when their source is understood.
7. Expose the result via a service and thin GraphQL query; add the UI and CLI adapter. This is a read
   operation and should not create domain events. A user-triggered credential change remains covered
   by existing credential services/events.

## Completion criteria

- A supported authenticated provider returns correctly normalized usage windows and reset times.
- Unsupported, unauthenticated, rate-limited, timed-out, and malformed responses have distinct safe
  results and do not break other providers.
- Requests execute where credentials live; tests prove raw secrets and provider payloads do not pass
  through GraphQL or logs.
- The UI is on-demand, communicates freshness, supports refresh, and does not imply a quota is exact
  when the provider source is unavailable.
- Trace session token metrics remain unchanged and are clearly labeled separately.
- Provider parser fixtures cover boundary values, missing fields, changed schemas, and time zones.
- Relevant adapter/bridge/service/GraphQL/UI tests pass; CLI coverage is included if session 1 has
  landed.

## Likely touchpoints

- new provider-usage adapter/service modules
- desktop and provisioned runtime bridge request/response contracts
- `apps/server/src/lib/bridge-handler.ts`
- `packages/gql/src/schema.graphql`
- coding-tools/settings UI
- Trace CLI provider command registry

Do not persist detailed historical usage, add billing enforcement, scrape browser pages, or turn
provider quotas into Trace organization quotas in this session.
