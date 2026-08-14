import { traceCliOperations } from "@trace/cli-contract";
import type {
  CodingTool,
  Event,
  HostingMode,
  Session,
  SessionGroup,
  SessionGroupKind,
  SessionGroupVisibility,
  StartSessionInput,
} from "@trace/gql";
import type { TraceClient } from "../../client.js";
import { CliError, usage } from "../../errors.js";
import type { CommandContext } from "../../runtime.js";

export type SessionView = Pick<
  Session,
  | "id"
  | "name"
  | "agentStatus"
  | "sessionStatus"
  | "tool"
  | "model"
  | "reasoningEffort"
  | "hosting"
  | "branch"
  | "sessionGroupId"
  | "createdAt"
  | "updatedAt"
> & {
  channel?: { id: string; name: string } | null;
  repo?: { id: string; name: string } | null;
};

export type EventView = Pick<
  Event,
  "id" | "eventType" | "scopeType" | "scopeId" | "timestamp" | "payload"
>;
export type GroupView = Pick<SessionGroup, "id" | "name" | "status" | "archivedAt">;

export const AGENT_STATUSES = ["not_started", "active", "done", "failed", "stopped"] as const;
export const CODING_TOOLS = [
  "antigravity",
  "claude_code",
  "codex",
  "cursor_composer",
  "custom",
  "pi",
] as const;
export const SESSION_KINDS = ["general", "coding", "design", "app"] as const;
export const HOSTING_MODES = ["cloud", "local"] as const;
export const VISIBILITIES = ["public", "private"] as const;

export function resolveSessionId(ctx: CommandContext, explicit?: string): string {
  return (
    explicit ||
    ctx.env.TRACE_SESSION_ID ||
    usage(
      'A session ID is required. Provide <session-id>, use --self inside a Trace session, or run "$TRACE_CLI" session list --json to find one.',
    )
  );
}

export function requireStartPrompt(prompt?: string | null): string {
  const value = prompt?.trim();
  if (value) return value;
  usage(
    'A task prompt is required to start a session. Provide it after session start or with --prompt "<task>".',
  );
}

export function printSession(session: SessionView): string {
  return [
    `${session.name} (${session.id})`,
    `Status: ${session.sessionStatus} / ${session.agentStatus}`,
    `Tool: ${session.tool}${session.model ? ` (${session.model})` : ""}`,
    `Hosting: ${session.hosting}`,
    `Group: ${session.sessionGroupId ?? "none"}`,
    `Channel: ${session.channel?.name ?? "none"}`,
    `Repo: ${session.repo?.name ?? "none"}`,
    ...(session.branch ? [`Branch: ${session.branch}`] : []),
  ].join("\n");
}

export async function getSession(ctx: CommandContext, id: string): Promise<SessionView> {
  const client = await ctx.client();
  const result = await client.graphql<{ session: SessionView | null }, { id: string }>(
    traceCliOperations.session,
    { id },
  );
  if (!result.session) usage(`Session not found: ${id}`);
  return result.session;
}

export async function resolveStartDefaultsAndDestination(
  client: TraceClient,
  input: StartSessionInput,
  currentSessionId?: string,
): Promise<void> {
  if (input.sessionGroupId) return;

  const hasExplicitDestination = !!input.channelId;
  const hasExplicitGeneratedKind = !!input.kind && input.kind !== "coding";
  const hasExplicitTool = !!input.tool;
  const hasExplicitRuntimeSelection =
    !!input.environmentId || !!input.runtimeInstanceId || !!input.hosting;

  let impliedRepo: { id: string; name: string } | null = null;
  if (currentSessionId) {
    const result = await client.graphql<
      {
        session: {
          id: string;
          tool: CodingTool;
          model?: string | null;
          reasoningEffort?: string | null;
          hosting: HostingMode;
          channel?: {
            id: string;
            name: string;
            repo?: { id: string; name: string } | null;
          } | null;
          repo?: { id: string; name: string } | null;
          connection?: {
            environmentId?: string | null;
            runtimeInstanceId?: string | null;
          } | null;
          sessionGroup?: {
            kind: SessionGroupKind;
            visibility: SessionGroupVisibility;
          } | null;
        } | null;
      },
      { id: string }
    >(traceCliOperations.startContextSession, { id: currentSessionId });
    if (!result.session) usage(`Current session not found: ${currentSessionId}`);
    const current = result.session;

    input.kind ??= current.sessionGroup?.kind;
    input.visibility ??= current.sessionGroup?.visibility;
    input.tool ??= current.tool;
    if (!hasExplicitTool) {
      input.model ??= current.model;
      input.reasoningEffort ??= current.reasoningEffort;
    }
    if (!hasExplicitRuntimeSelection && !hasExplicitGeneratedKind) {
      input.hosting ??= current.hosting;
      input.environmentId ??= current.connection?.environmentId;
      if (!input.environmentId && current.hosting === "local") {
        input.runtimeInstanceId ??= current.connection?.runtimeInstanceId;
      }
    }
    if (!hasExplicitDestination && (!input.kind || input.kind === "coding")) {
      input.channelId = current.channel?.id;
      input.repoId = current.repo?.id;
      impliedRepo = current.channel?.repo ?? current.repo ?? null;
    }
  }

  if (input.kind && input.kind !== "coding") return;
  if (!input.channelId) {
    usage(
      'A channel is required to start a coding session. Provide --channel <channel-id>, or start from a session already in a channel. Discover channels with "$TRACE_CLI" channel list --member-only --json.',
    );
  }

  if (input.channelId && !impliedRepo) {
    const result = await client.graphql<
      { channel: { id: string; name: string; repo?: { id: string; name: string } | null } | null },
      { id: string }
    >(traceCliOperations.startChannel, { id: input.channelId });
    if (!result.channel) usage(`Channel not found: ${input.channelId}`);
    impliedRepo = result.channel.repo ?? null;
  }

  if (impliedRepo && input.repoId && input.repoId !== impliedRepo.id) {
    usage(
      `The selected destination uses repo ${impliedRepo.id} (${impliedRepo.name}); remove --repo or use that repo`,
    );
  }
  input.repoId ??= impliedRepo?.id;
  if (!input.repoId) {
    usage(
      'The selected channel has no linked repository. Provide --repo <repo-id>, or choose a coding channel with a repository from "$TRACE_CLI" channel list --json.',
    );
  }
}

export function sessionUiPath(session: SessionView): string | null {
  if (!session.sessionGroupId) return null;
  return session.channel?.id
    ? `/c/${session.channel.id}/g/${session.sessionGroupId}/s/${session.id}`
    : `/g/${session.sessionGroupId}/s/${session.id}`;
}

export async function startSessionWithRetry(client: TraceClient, input: StartSessionInput) {
  const request = () =>
    client.graphql<{ startSession: SessionView }, { input: StartSessionInput }>(
      traceCliOperations.startSession,
      { input },
    );
  try {
    return await request();
  } catch (error) {
    if (!(error instanceof CliError) || !["connectivity", "server"].includes(error.category)) {
      throw error;
    }
    try {
      return await request();
    } catch (retryError) {
      if (retryError instanceof CliError) {
        throw new CliError(
          `${retryError.message}; retry with --idempotency-key ${input.clientMutationId}`,
          retryError.exitCode,
          retryError.category,
        );
      }
      throw retryError;
    }
  }
}
