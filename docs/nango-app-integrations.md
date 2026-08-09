# Nango application data integrations

Trace uses Nango for third-party authorization, credential storage, refresh, and authenticated
proxying. Trace remains the authorization boundary: it owns connection ownership, app bindings,
viewer access, allowed methods, and allowed provider paths.

## Server configuration

Set these variables on the Trace server:

```bash
NANGO_SECRET_KEY="..."
NANGO_WEBHOOK_SIGNING_KEY="..."
NANGO_BASE_URL="https://api.nango.dev" # optional
NANGO_GITHUB_INTEGRATION_KEY="github-getting-started" # optional override
NANGO_SNOWFLAKE_INTEGRATION_KEY="snowflake" # optional override
```

Configure the Nango environment's webhook URL as:

```text
https://<trace-server>/webhooks/nango
```

Enable new-connection auth webhooks. Trace verifies `X-Nango-Hmac-Sha256` against
`NANGO_WEBHOOK_SIGNING_KEY`; unsigned or incorrectly signed requests are rejected. Supported
providers and their capabilities are defined in the server integration catalog. Customers select
those providers in Trace and never enter Nango keys, HTTP methods, or provider paths.

## App request API

App code calls this reserved same-origin route:

```text
/__trace/integrations/<integration-name>/<provider-path>
```

For example:

```ts
const response = await fetch("/__trace/integrations/github/repos/acme/trace");
```

Trace authenticates the current viewer, verifies organization and application access, resolves the
binding's viewer/shared/service connection, checks the method and path allowlists, and sends the
request through Nango Proxy. Nango credentials and connection IDs are never returned to app code.

Published app endpoints default to private. Public app endpoints can render public content, but
their integration route still requires an authenticated organization member.

Copied private-app links are stable endpoint URLs and contain no preview credential. A signed-in
viewer who follows one is sent through `/auth/app-access`; Trace checks their current membership and
app access before issuing a five-minute endpoint-scoped cookie for that viewer. The sender's
identity is never transferred through the shared URL.

## Generated Node application API

New generated applications should call integrations from their Node `/api/*` routes. Trace injects
a signed, one-minute viewer context only into authorized `/api/*` requests; Trace session cookies
remain stripped from the untrusted runtime. The starter's server-only `trace` helper forwards that
context to Trace.

Snowflake queries use:

```ts
const result = await trace.integrations.snowflake.query(request, "snowflake", {
  sql: "SELECT name FROM analytics.customers WHERE created_at >= ?",
  parameters: [startDate],
  warehouse: "REPORTING_WH",
});
```

The Data access selection determines the underlying methods and paths; app code uses the stable
integration name rather than a binding UUID. Trace rejects the generic
proxy path for Snowflake statements, accepts only one `SELECT`/`WITH ... SELECT`, converts values to
Snowflake SQL API bindings, resolves the configured execution identity, and submits the query via
Nango. Browser code supplies application parameters to the Node route, never SQL or connection IDs.
