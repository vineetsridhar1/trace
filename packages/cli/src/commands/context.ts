import { defineCommand } from "../runtime.js";

export const contextCommand = defineCommand({
  path: ["context"],
  description: "Show the selected Trace server, organization, and session context",
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
