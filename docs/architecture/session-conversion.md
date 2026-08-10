# Session conversion

## Purpose

A general agent session is a durable control-plane conversation. It can monitor
work, answer questions, and coordinate across Trace. When that same work becomes
a focused specialized activity, the agent can convert the current session in
place. The group, active session, URL, participants, and event history remain
stable.

The agent creates a linked session only for independent or parallel work.

## Runtime policy

| Target kind                                          | Hosting        |
| ---------------------------------------------------- | -------------- |
| `general`                                            | cloud or local |
| `coding`                                             | cloud or local |
| `app`, `design`, `design_system`, `pdf`, `animation` | cloud only     |

Cloud-only conversion is a runtime migration: prepare and health-check the cloud
target before switching state, then invalidate and stop the old local runtime.
There is no silent local fallback.

## Conversion contract

Conversion is a service-layer operation. A target owns validation, preparation,
application, and failure cleanup. A target is not advertised until it implements
those operations. The product can say that sessions are convertible while the
runtime exposes only safe targets.

The first implemented target is `general` to `coding`. Coding-to-general is
deliberately deferred until runtime teardown and workspace detachment can be
performed atomically. Other
generated targets are deliberately rejected until their starter/runtime
provisioning is implemented as an atomic conversion target.

A coding conversion requires a coding channel. The channel is the destination
and supplies its linked repository; an explicit repository is accepted only
when the channel has none. This matches normal coding-session creation and
prevents repo-only sessions from bypassing the channel workflow.

Every successful conversion appends `session_converted` in the active session's
scope with complete `session` and `sessionGroup` snapshots. Clients update their
Zustand entity state only from that event.
