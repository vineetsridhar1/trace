import { describe, expect, it } from "vitest";
import { buildHookRunnerWrapperScript } from "./hook-runtime.js";

describe("buildHookRunnerWrapperScript", () => {
  it("exits successfully when a stale packaged runner path is gone", () => {
    const script = buildHookRunnerWrapperScript({
      electronBinaryPath: "/private/var/folders/translocated/Trace.app/Contents/MacOS/Trace",
      runnerScriptPath:
        "/private/var/folders/translocated/Trace.app/Contents/Resources/app.asar.unpacked/dist/hook-runner.js",
    });

    expect(script).toContain('if [ ! -x "$ELECTRON_BINARY" ] || [ ! -f "$TRACE_HOOK_RUNNER" ]; then');
    expect(script).toContain("  exit 0");
    expect(script).toContain('exec "$ELECTRON_BINARY" "$TRACE_HOOK_RUNNER" "$@"');
  });
});
