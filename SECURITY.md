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
