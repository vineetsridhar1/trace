# Session conversion

## Purpose

A general agent session is a durable control-plane conversation. It can monitor
work, answer questions, and coordinate across Trace. When that same work becomes
a focused specialized activity, the agent can convert the current session in
place. The group, active session, URL, participants, and event history remain
stable.

The agent creates a linked session only for independent or parallel work.

## Runtime policy

| Target kind                         | Hosting        |
| ----------------------------------- | -------------- |
| `general`                           | cloud or local |
| `coding`                            | cloud or local |
| `app`, `design`, `pdf`, `animation` | cloud only     |
| `design_system`                     | dedicated flow |

Cloud-only conversion is a runtime migration: verify that a cloud environment
exists, prepare the managed repository, stop the old runtime, persist the cloud
binding, and provision the target starter. Provisioning failures remain visible
and retryable on the converted session. There is no silent local fallback.

The durable kind change and runtime preparation are separate outcomes. Once the
kind change commits, a handoff error is recorded as a retryable workspace failure
on the converted session; the mutation does not claim that the conversion itself
rolled back, and its managed repository is retained for retry.

## Conversion contract

Conversion is a service-layer operation. A target owns validation, preparation,
application, and failure cleanup. A target is not advertised until it implements
those operations. The product can say that sessions are convertible while the
runtime exposes only safe targets.

Supported conversions start from `general` and target `coding`, `app`, `design`,
`pdf`, or `animation`. Coding-to-general and specialized-to-specialized
transitions remain deferred until workspace teardown and replacement can be
made safe. Design-system authoring is not a standalone mode: it requires a
source repository and a `DesignSystem` record, so it keeps its dedicated
creation flow.

A coding conversion requires a coding channel. The channel is the destination
and supplies its linked repository; an explicit repository is accepted only
when the channel has none. This matches normal coding-session creation and
prevents repo-only sessions from bypassing the channel workflow.

A repository attached to a general session is context only. Local and cloud
general sessions always run from `~/trace/general-sessions/<session-group-id>`,
never a writable repository checkout. Converting to coding upgrades that scratch
workspace to the selected repository worktree. The bridge removes the scratch
directory after a successful upgrade; cross-runtime cleanup is persisted and
retried when the source bridge reconnects.

Creation-mode conversion clears channel/project links, creates a Trace-managed
repo, stops the old runtime, and moves the existing session to the default cloud
environment. Runtime preparation uses the same target-specific starter and
system instructions as normal session creation. Its first command is only a
short continuation prompt; the normal first-run path prepends the preserved
conversation so the target agent receives the full task context without a
second copy of the user's request.

Every successful conversion appends `session_converted` in the active session's
scope with complete `session` and `sessionGroup` snapshots. Clients update their
Zustand entity state only from that event.
