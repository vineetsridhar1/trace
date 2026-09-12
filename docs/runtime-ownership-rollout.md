# Group-owned runtime rollout

`SessionGroup.connection` owns the runtime identity and lifecycle. Grouped session
connections are one-way compatibility projections, not independent state machines.
Per-session activity, invocations and pending commands remain session-owned.

This adapts upstream opendoor-labs/trace #183, #191 and #193–195 to this fork,
including its generated-project previews, design-library selection and workspace
preparation protocol. It replaces the narrower changes proposed in #957 and #958.

## Invariants

- Lifecycle updates serialize on the group row; sibling session state cannot
  overwrite the shared runtime. Workspace metadata updates cannot write connections.
- Workspace callbacks validate runtime identity and connection generation under
  that lock and update the group and session projections in the same transaction.
- New local selections store their bridge generation. A legacy missing generation
  can be initialized by a currently authenticated bridge callback; a conflicting
  stored generation is rejected.
- Readiness comes from bridge workspace preparation, not a synthetic home-directory
  callback. Startup state uses the same admission predicate as provisioning.
- Moves and pending-command replay share the transition lock. Queues are preserved
  until delivery succeeds, and completion removes only the delivered command.
- A delayed teardown cannot change its target to a newer group runtime. Internal
  messages, terminals, artifact exports and managed-git authorization use group ownership.

## Deployment requirement

This is **not a mixed-version rolling migration**. Mirroring values onto session
rows cannot prevent an old API replica from writing stale group state.

1. Back up the database; pause new session mutations and provisioning, then drain
   old API writers, bridge handlers and background lifecycle workers.
2. Apply the migration. Existing group connections always win, regardless of
   per-session version counters. Missing connections are recovered only when legacy
   runtime ownership is unambiguous; otherwise migration fails for reconciliation.
3. Start only upgraded API/worker replicas and reconnect bridges.
4. Smoke-test local/cloud creation, deferred starts, sibling tabs, reconnects,
   runtime moves, terminal access, generated previews and queued command replay.
5. Resume normal traffic only after those checks succeed. Do not roll back by
   mixing old writers into the running upgraded deployment.

## Verification

- Server TypeScript build.
- Unit regressions for callback rejection/atomic writes, generation initialization,
  provisioning admission, canonical reads, sibling rebinding and teardown fencing.
- PostgreSQL migration check using only temporary tables, rolled back afterward:

  ```sh
  psql -X -v ON_ERROR_STOP=1 -d <test-database> -f apps/server/test/session-group-runtime-migration.sql
  ```

- Compare the full server suite with unchanged base `b4db36a4e`. That baseline has
  existing failures; passing new regressions is not a claim that the whole suite
  is green or that distributed production behavior is bug-free. The live multi-replica
  smoke test above is still required before deployment.
