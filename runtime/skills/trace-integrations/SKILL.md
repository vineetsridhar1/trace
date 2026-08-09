---
name: trace-integrations
description: Discover, connect, and configure supported integrations for the current Trace app, then use them safely from its Node backend.
---

# Trace app integrations

Use this skill whenever the user asks a Trace app to use connected or third-party data.

## Invocation and safety

- Invoke the CLI as `"$TRACE_CLI"`; do not assume `trace` is on `PATH`.
- Use `--json` when reading output programmatically.
- Never print, log, or pass `$TRACE_INVOCATION_TOKEN`. The CLI reads it automatically.
- Do not call Trace's GraphQL API directly or ask the user to configure the Data access GUI.
- Configure only the current app. The CLI and server reject attempts to target another app.
- Select the smallest capability set that satisfies the request. Never broaden access silently.
- Keep credentials, provider connection IDs, SQL, and provider request construction out of browser code.

## Discover available integrations

Always inspect the live catalog before writing integration code:

```sh
"$TRACE_CLI" integration list --json
```

The result describes supported integrations, connected accounts, access already granted to the
current app, available capability IDs, and provider-specific runtime guides. Treat that output as
the source of truth instead of guessing integration keys, paths, or helper APIs.

If the requested provider is absent, explain that Trace does not support it yet. Do not substitute
another provider or invent configuration.

## Connect an account when needed

If the required identity has no connection, create an authorization link:

```sh
"$TRACE_CLI" integration connect <integration-id> --json
```

Return the `connectLink` to the user and wait for them to complete provider authorization. Then run
`integration list --json` again to confirm the connection. OAuth or provider authentication is the
only step the user must perform themselves.

Use `--service` only when the user explicitly wants an organization-owned service identity. Service
connections require organization-admin permission. Do not turn a personal account into an implicit
shared or service identity.

## Grant the current app access

Viewer identity is the default and uses each viewer's own provider account:

```sh
"$TRACE_CLI" integration add github --capabilities profile --identity viewer --json
```

When an integration exposes one capability, `--capabilities` may be omitted. When it exposes
several, choose the necessary comma-separated IDs from the catalog. To intentionally use a shared
personal or service connection, pass the connection ID returned by `integration list`:

```sh
"$TRACE_CLI" integration add <integration-id> --capabilities <ids> --identity shared --connection <connection-id> --json
"$TRACE_CLI" integration add <integration-id> --capabilities <ids> --identity service --connection <connection-id> --json
```

The command creates or updates the provider's stable binding for the current app. Application code
uses the integration ID, such as `github` or `snowflake`; it never needs a binding UUID or Nango key.

Remove access only when requested:

```sh
"$TRACE_CLI" integration remove <integration-id> --json
```

## Build the app

After access is configured, follow the integration and capability `guide` values returned by
`integration list`. Put provider calls in a generated Node route and have React call only that
same-origin `/api/*` route.

For generic providers, the server pattern is:

```ts
const result = await trace.integrations.request(request, "github", {
  method: "GET",
  path: "/user",
});
```

For Snowflake, use `trace.integrations.snowflake.query()` from the Node route. Keep fixed SQL on the
server and accept only declared parameter values from the browser. Trace validates read-only SQL on
every execution.

Exercise loading, success, missing-connection, authorization, and provider-error states. If runtime
access fails, rerun `integration list --json` before changing code or permissions.
