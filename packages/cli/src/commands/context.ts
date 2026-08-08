import type { Command } from "../runtime.js";

export const contextCommand: Command = {
  path: ["context"],
  usage: "trace context [--json]",
  description: "Show the selected Trace server, organization, and session context",
  async run(ctx) {
    const value = {
      serverUrl: ctx.env.TRACE_SERVER_URL || ctx.env.TRACE_API_URL || ctx.config.serverUrl,
      organizationId:
        ctx.options.organizationId ||
        ctx.env.TRACE_ORGANIZATION_ID ||
        ctx.config.activeOrganizationId ||
        null,
      sessionId: ctx.env.TRACE_SESSION_ID || null,
      sessionGroupId: ctx.env.TRACE_SESSION_GROUP_ID || null,
      authentication: ctx.env.TRACE_INVOCATION_TOKEN ? "session" : "human",
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
};
