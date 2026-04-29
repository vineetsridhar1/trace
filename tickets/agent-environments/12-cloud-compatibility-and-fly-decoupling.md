# 12 - Cloud Compatibility and Fly Decoupling

## Summary

Remove Fly as a core product assumption while keeping existing cloud sessions functional during migration.

## Plan coverage

Owns plan lines:

- 1-29: goal to avoid hardcoded cloud/Fly and keep Fly outside Trace core
- 30-42: current Fly/cloud-machine baseline
- 421-438: remove direct `"cloud"` branching from session routing
- 483-493: generic provisioned provider contract instead of provider-specific core code
- 832-856: provider-neutral events with provider details only in metadata
- 950-956: phase 2 Fly/cloud-machine removal or isolation
- 995-1001: phase 8 compatibility cleanup
- 1042-1051: open decisions around runtime state, local selection, Fly compatibility, polling, token format, HMAC, and capabilities
- 1068-1077: AWS VPC path through provisioned adapter and no first-party AWS/Fly core support

## What needs to happen

- Audit current Fly/cloud-machine code paths.
- Decide whether current Fly support becomes:
  - temporary compatibility shim, or
  - external reference launcher, or
  - removed after migration
- Migrate existing cloud config to `provisioned` environments where possible.
- Update session routing so new cloud sessions use `ProvisionedRuntimeAdapter`.
- Ensure product events do not expose provider-specific lifecycle names.
- Remove or isolate provider-specific imports from core session services.
- Document how to run Fly through the generic provisioned lifecycle endpoint.

## Dependencies

- [06 - Provisioned Lifecycle Adapter](06-provisioned-lifecycle-adapter.md)
- [08 - Startup Lifecycle and Pending Delivery](08-startup-lifecycle-and-pending-delivery.md)
- [09 - Deprovisioning and Runtime Reconciliation](09-deprovisioning-and-runtime-reconciliation.md)
- [11 - Session Environment Selection](11-session-environment-selection.md)

## Completion requirements

- [ ] New cloud sessions do not require Fly-specific code paths.
- [ ] Existing cloud sessions have a compatibility path or documented migration.
- [ ] Fly-specific imports are removed from core services or isolated behind a temporary compatibility layer.
- [ ] Event names remain provider-neutral.
- [ ] Documentation explains that Fly belongs behind the provisioned launcher contract.

## Implementation notes

- Do not add `fly` back as an adapter type.
- If a temporary shim is needed, make it visibly transitional and keep the target shape provisioned-only.
- This ticket is where product and migration tradeoffs should be decided explicitly.

## How to test

1. Start a new provisioned cloud session with a mock launcher.
2. Verify no Fly-specific adapter is selected for the new session.
3. Verify existing cloud session records still render or migrate cleanly.
4. Search core service/router code for provider-specific imports.
