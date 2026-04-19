# 34 — CI Integration and EAS Preview Builds

## Summary

Extend the existing GitHub Actions pipeline to typecheck/lint/build `apps/mobile` and `packages/client-core`, and optionally produce an EAS preview build on PRs touching mobile. Guardrails against regressions in shared code.

## What needs to happen

- **Existing CI extensions:**
  - Ensure `pnpm lint` and `pnpm typecheck` cover `apps/mobile` and `packages/client-core`.
  - Add a CI step that runs `pnpm --filter @trace/client-core lint` with the strict no-web-imports rule enabled.
  - Fail CI on any `any` usage in mobile or client-core (existing project rule per CLAUDE.md).
- **File-size guardrail for mobile**:
  - Add a small CI script (or pre-commit hook) that fails if any `.ts`/`.tsx` in `apps/mobile/src/` or `apps/mobile/app/` exceeds 200 lines.
  - Scope the check to only files created/modified in the diff on PRs to avoid a wall of existing-file failures (exceptions only in rare spots — documented in `.filesizelint.json` allowlist).
- **EAS preview builds** (optional but recommended):
  - GitHub Action on PRs touching `apps/mobile/**` or `packages/client-core/**`: runs `eas build --profile preview --platform ios --non-interactive`.
  - Comments the build URL on the PR.
  - Build artifact installable via TestFlight internal group or direct ad-hoc link.
  - Skippable via PR label `skip-eas`.
- **Smoke test job** (Maestro or Detox — pick one; recommend Maestro):
  - Simple flow: launch app → sign-in screen visible.
  - Optional: mock a token and verify authed shell loads.
  - Runs on simulator in CI.

## Dependencies

- All M1–M5 tickets complete (meaningful CI targets exist).

## Completion requirements

- [ ] CI runs typecheck + lint for mobile and client-core on every PR
- [ ] File-size guardrail catches >200-line files added in PRs
- [ ] EAS preview build triggers on mobile-touching PRs and comments the URL
- [ ] Smoke test runs and passes

## How to test

1. Open a PR that intentionally adds a 250-line file in `apps/mobile/` → CI fails with a helpful message.
2. Open a PR that imports `react-dom` in `packages/client-core/` → lint fails.
3. Open a PR touching mobile → EAS preview link appears in PR comments ~10min later.
4. Smoke test passes on simulator.
