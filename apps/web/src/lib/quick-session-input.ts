import type { CodingTool, SessionGroupKind, SessionGroupVisibility } from "@trace/gql";

export interface QuickSessionOptions {
  sessionGroupId?: string;
  visibility?: SessionGroupVisibility;
  tool?: CodingTool;
  kind?: Extract<SessionGroupKind, "coding" | "general">;
}

export function buildQuickSessionStartInput(
  channelId: string,
  repoId: string | undefined,
  options: QuickSessionOptions = {},
) {
  return {
    deferRuntimeSelection: true,
    channelId,
    ...(repoId ? { repoId } : {}),
    ...(options.kind ? { kind: options.kind } : {}),
    ...(options.sessionGroupId ? { sessionGroupId: options.sessionGroupId } : {}),
    ...(options.visibility ? { visibility: options.visibility } : {}),
    ...(options.tool ? { tool: options.tool } : {}),
  };
}
