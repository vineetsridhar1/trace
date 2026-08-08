# Paseo-Inspired Trace Implementation Sessions

These briefs split the accepted Paseo-inspired work into independently executable AI sessions. Each
brief is written to be copied into a fresh session as-is. The source analysis behind them is in
[`../paseo-control-plane-port-plan.md`](../paseo-control-plane-port-plan.md).

## Recommended order

| Order | Session | Why it is separate | Depends on |
| --- | --- | --- | --- |
| 1 | [Trace CLI and agent client](01-trace-cli-and-agent-client.md) | Establishes the first-party non-UI client and its two identity modes | Nothing |
| 2 | [Provider discovery and diagnostics](02-provider-discovery-and-diagnostics.md) | One runtime catalog should own both capabilities and actionable failures | Nothing |
| 3 | [Provider usage and quotas](03-provider-usage-and-quotas.md) | Uses different provider APIs and credential boundaries from discovery | Provider catalog types are helpful, not required |
| 4 | [Terminal capture and control](04-terminal-capture-and-control.md) | Extends Trace's existing terminal relay with bounded, authorized automation | CLI for final CLI commands; service work can start first |
| 5 | [Terminal activity and attention](05-terminal-activity-and-attention.md) | Adds a source-agnostic activity model plus opt-in provider hooks | Terminal ownership model; does not require capture |
| 6 | [Git and pull-request controls](06-git-and-pull-request-controls.md) | Adds curated repo/forge actions without exposing arbitrary shell access | CLI for final CLI commands; services can start first |
| 7 | [Shared desktop browser](07-shared-desktop-browser.md) | A visible, persistent browser is a distinct desktop/security project | CLI is useful for agent control |
| 8 | [Existing-capabilities audit](08-existing-capabilities-audit.md) | Verifies repo config, local mode, and pairing, then closes only demonstrated gaps | Nothing |

Sessions 2, 3, 4, 5, 6, and 8 can proceed in parallel if different branches are used. Session 1
should define the CLI conventions before other sessions add final CLI commands. Session 7 should use
those conventions rather than inventing a browser-only agent protocol.

## Scope decisions already made

- The CLI is another Trace client. It uses the existing GraphQL, subscription, terminal, upload, and
  service-layer contracts rather than introducing a second control API.
- Human CLI authentication should generalize the existing paired-mobile-device model.
- An in-session agent uses the same CLI and endpoints with a restricted, session-scoped credential;
  it must not receive a user's full device credential.
- The shared browser is a visible Trace Desktop browser with a persistent authenticated profile that
  both the user and an explicitly authorized agent can control.
- Agent orchestration, schedules, worker loops, voice, and a plugin ecosystem are out of scope.
- Trace's central-server architecture remains authoritative. Do not copy Paseo's daemon registry or
  encrypted local relay merely for parity.

## Rules every implementation session must preserve

- Read the repository's `AGENTS.md` before changing code.
- Business logic belongs in services. GraphQL resolvers and CLI commands are thin adapters.
- Mutations produce events in the service layer; clients do not manufacture events.
- Agents and users use the same capability implementations, with different authenticated actors and
  grants where necessary.
- Never expose raw runtime bridge commands, arbitrary filesystem paths, provider credentials, or an
  unrestricted shell as a convenience API.
- Update `packages/gql/src/schema.graphql` and run `pnpm gql:codegen` for schema changes.
- Add focused unit/integration tests and run the smallest relevant tests plus typecheck/build checks.
- Keep each PR limited to its brief. Do not add orchestration or unrelated Paseo parity work.
