# Open Design Vendor Boundary

- Upstream: `nexu-io/open-design`
- Target tag: `v0.14.1`
- License: Apache-2.0
- Trace overlay: `../trace-overlay.ts`

## Rebase Procedure

1. Diff upstream `apps/daemon/src/prompts/` between the current pinned tag and the new tag.
2. Replace files in this directory with the upstream prompt composer subset.
3. Keep Trace-specific session rules out of vendored files.
4. Update prompt snapshot tests in `packages/shared/test/design.test.ts`.
