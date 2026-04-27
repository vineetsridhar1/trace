# Security Policy

## Reporting Vulnerabilities

Please do not open public issues for suspected security vulnerabilities.

Report vulnerabilities by emailing the maintainers at security@gettrace.org with:

- A description of the issue and its impact
- Steps to reproduce or a proof of concept
- Affected versions, deployments, or configuration
- Any known mitigations

We will acknowledge receipt as soon as practical and coordinate disclosure after
we have investigated and prepared a fix.

## Secrets

Do not commit secrets, API keys, private keys, OAuth client secrets, or production
environment files. Use `.env.example` and `deploy/.env.example` as templates only.

## Known Advisory

`pnpm audit --prod` reports `GHSA-v3m3-f69x-jf25` against Quill 2.0.3. Upstream
does not publish a patched version for this advisory. Trace does not expose
Quill's HTML export as a trusted-output path, and rendered message HTML is
sanitized server-side and client-side. CI should gate on
`pnpm audit --prod --audit-level moderate` until Quill publishes a fix or the
editor is replaced.
