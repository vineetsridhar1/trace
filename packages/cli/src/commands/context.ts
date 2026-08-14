import { defineCommand } from "../runtime.js";

export const contextCommand = defineCommand({
  path: ["context"],
  description: "Show the selected Trace server, organization, and session context",
  examples: ['"$TRACE_CLI" context --json'],
  effects: ["Read-only; does not change Trace state."],
  output: "The selected server, organization, session, session group, and authentication state.",
  nextSteps: [
    'Run "$TRACE_CLI" channel list --member-only --json to choose a channel.',
    'Run "$TRACE_CLI" session get --json to inspect the current session.',
  ],
  async run(ctx) {
    const value = {
      serverUrl: ctx.env.TRACE_API_URL || ctx.env.TRACE_SERVER_URL || null,
      organizationId: ctx.env.TRACE_ORGANIZATION_ID || null,
      sessionId: ctx.env.TRACE_SESSION_ID || null,
      sessionGroupId: ctx.env.TRACE_SESSION_GROUP_ID || null,
      authentication: ctx.env.TRACE_INVOCATION_TOKEN ? "session" : "missing",
    };
    ctx.output(
      value,
      [
        `Server: ${value.serverUrl}`,
        `Organization: ${value.organizationId ?? "none"}`,
        `Session: ${value.sessionId ?? "none"}`,
        `Session group: ${value.sessionGroupId ?? "none"}`,
        `Authentication: ${value.authentication}`,
      ].join("\n"),
    );
  },
});
