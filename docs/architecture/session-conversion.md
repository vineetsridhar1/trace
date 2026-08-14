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

Cloud-only conversion reuses an available cloud runtime when it supports the
selected tool. Trace stops the general agent process, atomically persists the
target kind and managed repository while retaining the runtime binding, then
replaces the scratch directory with the target workspace. A local, disconnected,
or tool-incompatible source instead provisions a replacement in the default cloud
environment. Failures before the transaction leave the session general and remove
the unused managed repo. Preparation or provisioning failures after conversion
commits remain visible and retryable on the converted session. There is no silent
local fallback.

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

A coding conversion requires a coding channel that the actor can see, and the
same group lock as a runtime move. The channel is the destination and supplies
its linked repository; an explicit repository is accepted only when the channel
has none, and a local runtime must already have that repository linked. This
matches normal coding-session creation and prevents repo-only sessions from
bypassing the channel workflow. An explicit project must belong to the
destination; otherwise the project the general session already carried is kept
when it still belongs to that destination and dropped when it does not.

A repository attached to a general session is context only. Local and cloud
general sessions always run from `~/trace/general-sessions/<session-group-id>`,
never a writable repository checkout. Converting to coding always upgrades that
scratch workspace to the selected repository worktree, so a converted session is
never left running outside the checkout its instructions assume; an
agent-initiated conversion additionally resumes the request there. The bridge
removes the scratch directory after a successful upgrade; cross-runtime cleanup
is persisted until the source bridge confirms deletion and retried when that
bridge reconnects.

Creation-mode conversion clears channel/project links, creates a Trace-managed
repo, and stops the general agent process. It reuses compatible cloud compute or
moves local/incompatible sessions to the default cloud environment. Runtime
preparation uses the same target-specific starter and system instructions as
normal session creation. Its first command is only a short continuation prompt;
the normal first-run path prepends the preserved conversation so the target agent
receives the full task context without a second copy of the user's request.

Every successful conversion appends `session_converted` in the active session's
scope with complete `session` and `sessionGroup` snapshots. Clients update their
Zustand entity state only from that event.
