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
```

Configure the Nango environment's webhook URL as:

```text
https://<trace-server>/webhooks/nango
```

Enable new-connection auth webhooks. Trace verifies `X-Nango-Hmac-Sha256` against
`NANGO_WEBHOOK_SIGNING_KEY`; unsigned or incorrectly signed requests are rejected. Create each
supported provider integration in Nango and use its integration key when connecting it in Trace
settings.

## App request API

App code calls this reserved same-origin route:

```text
/__trace/integrations/<binding-id>/<provider-path>
```

For example:

```ts
const response = await fetch(
  "/__trace/integrations/8e6907b0-1de7-4af5-89d2-a59e4d6a49c3/repos/acme/trace",
);
```

Trace authenticates the current viewer, verifies organization and application access, resolves the
binding's viewer/shared/service connection, checks the method and path allowlists, and sends the
request through Nango Proxy. Nango credentials and connection IDs are never returned to app code.

Published app endpoints default to private. Public app endpoints can render public content, but
their integration route still requires an authenticated organization member.
