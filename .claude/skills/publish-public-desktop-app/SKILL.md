---
name: publish-public-desktop-app
description: Build and publish the public Trace macOS desktop app release to GitHub
user_invocable: true
argument: Optional semver version, with or without a leading v
---

# Publish Public Desktop App

Publish the public Trace desktop app to the public GitHub releases feed.

## Target

- Production URL: `https://gettrace.org`
- Update repo: `vineetsridhar1/trace`
- Git remote: `origin`
- Desktop package: `apps/desktop`
- Release tag format: `v<apps/desktop/package.json version>`

## Instructions

1. **Confirm prerequisites**
   - Run `gh auth status` and verify the active account can write to `vineetsridhar1/trace`.
   - Verify `pnpm --version` is 10+ and `node --version` is 22+.
   - Check macOS signing/notarization env:
     - Production releases should have signing enabled with either `TRACE_MACOS_SIGN_IDENTITY` available through the keychain default or exported explicitly.
     - Production releases should have notarization configured with `TRACE_MACOS_NOTARY_KEYCHAIN_PROFILE`, or the Apple API/Apple ID env accepted by `apps/desktop/forge.config.mjs`.
     - If the user explicitly asks for an unsigned build, set `TRACE_MACOS_SKIP_SIGN=1`; otherwise stop and ask for signing/notarization setup.
   - Export a GitHub token for Electron Forge if one is not already present:

     ```bash
     export GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-$(gh auth token)}}"
     ```

2. **Choose the version**
   - If an argument was provided, normalize it to a package version without a leading `v`.
   - If no argument was provided, inspect latest releases with:

     ```bash
     gh release list --repo vineetsridhar1/trace --limit 10
     ```

     Then bump the patch version in `apps/desktop/package.json`.
   - Ensure the resulting tag does not exist:

     ```bash
     gh release view "v<VERSION>" --repo vineetsridhar1/trace
     ```

     If it exists, choose a new version before continuing.

3. **Update desktop version**
   - Edit `apps/desktop/package.json` so its `version` field is the chosen version.
   - Do not change unrelated package metadata.

4. **Verify before release**
   - Run:

     ```bash
     pnpm --filter @trace/desktop test
     pnpm --filter @trace/desktop build
     ```

5. **Dry-run the exact release**
   - Run from the repo root:

     ```bash
     TRACE_PRODUCTION_URL=https://gettrace.org \
     TRACE_DESKTOP_UPDATE_REPO=vineetsridhar1/trace \
     pnpm --filter @trace/desktop publish:mac --dry-run
     ```

   - Inspect `out/desktop-release` and the Forge output for signing, maker, or update-feed issues.

6. **Publish to GitHub**
   - Run from the repo root:

     ```bash
     TRACE_PRODUCTION_URL=https://gettrace.org \
     TRACE_DESKTOP_UPDATE_REPO=vineetsridhar1/trace \
     pnpm --filter @trace/desktop publish:mac --from-dry-run
     ```

7. **Confirm release**
   - Verify the release exists and contains macOS artifacts:

     ```bash
     gh release view "v<VERSION>" --repo vineetsridhar1/trace
     ```

   - Report the release URL, version, and whether signing/notarization was used.

## Important

- The public and private app builds are distinguished by `TRACE_DESKTOP_UPDATE_REPO`, not by separate source code.
- Do not reuse a version that already exists in either release repo if publishing both feeds.
- Do not commit credentials, signing files, or generated release artifacts.
