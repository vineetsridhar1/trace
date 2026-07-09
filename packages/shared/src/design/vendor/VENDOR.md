# Open Design Vendor Boundary

- Upstream: `nexu-io/open-design`
- Target ref: `release/v0.14.1`
- Target commit: `c1b7fcf95dce0869b81aaa75e69f40fd27505c54`
- Note: upstream did not expose a `v0.14.1` Git tag at vendor time; the release branch
  carries the documented version commit.
- License: Apache-2.0
- Trace overlay: `../trace-overlay.ts`

## Rebase Procedure

1. Diff upstream `apps/daemon/src/prompts/` between the current pinned ref and the new ref.
2. Replace files in `prompts/` with the upstream prompt composer subset.
3. Keep the small local stubs in `contracts/` and `media/` aligned with upstream type usage.
4. Keep Trace-specific session rules out of vendored prompt files.
5. Update prompt snapshot tests in `packages/shared/test/design.test.ts`.
