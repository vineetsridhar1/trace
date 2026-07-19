import type { SessionApplicationProcess } from "@trace/gql";

export function buildPreviewFixPrompt(process: SessionApplicationProcess): string {
  const failure = process.lastError?.trim() || `The process exited with code ${process.exitCode}.`;
  return [
    "The Trace-managed live preview process failed and is no longer running.",
    `Process: ${process.label}. Failure: ${failure}`,
    "Diagnose and fix the root cause. Inspect the existing process logs and preview configuration, correct the code or configuration, and verify the app can bind to its configured preview port.",
    "Do not start a detached or second dev server; Trace owns the managed preview process. Keep the fix focused and commit it when it is ready.",
  ].join("\n\n");
}
