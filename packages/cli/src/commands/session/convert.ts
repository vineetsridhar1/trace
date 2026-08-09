import { randomUUID } from "node:crypto";
import type { CodingTool, SessionGroupKind } from "@trace/gql";
import { traceCliOperations } from "@trace/cli-contract";
import { defineCommand, optionString } from "../../runtime.js";
import { printSession, resolveSessionId, SESSION_KINDS, type SessionView } from "./shared.js";

type ConvertSessionGroupInput = {
  sessionGroupId: string;
  kind: SessionGroupKind;
  repoId?: string;
  projectId?: string;
  tool?: CodingTool;
  model?: string;
  reasoningEffort?: string;
  environmentId?: string;
  runtimeInstanceId?: string;
  clientMutationId: string;
};

export const sessionConvertCommand = defineCommand({
  path: ["session", "convert"],
  description: "Convert the current session group in place",
  options: [
    { name: "session", flag: "--session", kind: "string", valueName: "ID", description: "Source session" },
    { name: "kind", flag: "--kind", kind: "string", valueName: "KIND", choices: SESSION_KINDS, description: "Target session kind" },
    { name: "repo", flag: "--repo", kind: "string", valueName: "ID", description: "Target repository" },
    { name: "project", flag: "--project", kind: "string", valueName: "ID", description: "Target project" },
    { name: "tool", flag: "--tool", kind: "string", valueName: "TOOL", description: "Coding tool override" },
    { name: "model", flag: "--model", kind: "string", valueName: "MODEL", description: "Model override" },
    { name: "reasoning", flag: "--reasoning", kind: "string", valueName: "EFFORT", description: "Reasoning override" },
    { name: "environment", flag: "--environment", kind: "string", valueName: "ID", description: "Cloud environment" },
    { name: "runtime", flag: "--runtime", kind: "string", valueName: "ID", description: "Local runtime" },
    { name: "idempotencyKey", flag: "--idempotency-key", kind: "string", valueName: "KEY", description: "Retry-safe key" },
  ],
  async run(ctx, parsed) {
    const client = await ctx.client();
    const source = await client.graphql<{ session: { sessionGroupId?: string | null } | null }, { id: string }>(
      traceCliOperations.session,
      { id: resolveSessionId(ctx, optionString(parsed, "session")) },
    );
    if (!source.session?.sessionGroupId) throw new Error("Session does not belong to a session group");
    const kind = optionString(parsed, "kind");
    if (!kind) throw new Error("--kind is required");
    const input: ConvertSessionGroupInput = {
      sessionGroupId: source.session.sessionGroupId,
      kind: kind as SessionGroupKind,
      repoId: optionString(parsed, "repo"), projectId: optionString(parsed, "project"),
      tool: optionString(parsed, "tool") as CodingTool | undefined,
      model: optionString(parsed, "model"), reasoningEffort: optionString(parsed, "reasoning"),
      environmentId: optionString(parsed, "environment"), runtimeInstanceId: optionString(parsed, "runtime"),
      clientMutationId: optionString(parsed, "idempotencyKey") ?? randomUUID(),
    };
    const result = await client.graphql<{ convertSessionGroup: SessionView }, { input: ConvertSessionGroupInput }>(traceCliOperations.convertSessionGroup, { input });
    ctx.output({ session: result.convertSessionGroup }, printSession(result.convertSessionGroup));
  },
});
