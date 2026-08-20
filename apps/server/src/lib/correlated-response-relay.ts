import { realtimeBackplane } from "./realtime-backplane.js";

const ROUTED_REQUEST_PREFIX = "trace-r1";
const RELAYED_RESPONSE_TYPES = new Set([
  "endpoint_http_response",
  "endpoint_http_error",
  "endpoint_ws_opened",
  "endpoint_ws_data",
  "endpoint_ws_closed",
  "browser_live_frame_result",
  "linked_checkout_status_result",
  "linked_checkout_changed_file_result",
  "linked_checkout_action_result",
  "session_current_branch_result",
  "session_git_sync_status_result",
  "branches_result",
  "workspace_slugs_result",
  "worktrees_result",
  "files_result",
  "file_content_result",
  "file_write_result",
  "file_commit_result",
  "worktree_changes_result",
  "revert_worktree_file_result",
  "branch_diff_result",
  "file_at_ref_result",
  "skills_result",
]);
const ROUTED_COMMAND_TYPES = new Set([
  "endpoint_http_request",
  "endpoint_ws_open",
  "endpoint_ws_data",
  "endpoint_ws_close",
  "browser_live_frame",
  "list_branches",
  "list_workspace_slugs",
  "list_worktrees",
  "list_files",
  "read_file",
  "write_file",
  "write_file_guarded",
  "commit_file_changes",
  "commit_scoped_file_changes",
  "worktree_changes",
  "revert_worktree_file",
  "branch_diff",
  "file_at_ref",
  "list_skills",
  "linked_checkout_status",
  "linked_checkout_changed_file",
  "linked_checkout_link_repo",
  "linked_checkout_sync",
  "linked_checkout_commit",
  "linked_checkout_restore",
  "linked_checkout_set_auto_sync",
  "session_current_branch",
  "session_git_sync_status",
]);

type RelayedResponse = {
  runtimeKey: string;
  connectionGeneration: string;
  message: Record<string, unknown>;
};

type ResponseHandler = (response: RelayedResponse) => void;

function parseRoutedRequestId(requestId: string): { replicaId: string; requestId: string } | null {
  const [prefix, encodedReplicaId, ...requestParts] = requestId.split(".");
  if (prefix !== ROUTED_REQUEST_PREFIX || !encodedReplicaId || requestParts.length === 0)
    return null;
  try {
    return {
      replicaId: Buffer.from(encodedReplicaId, "base64url").toString("utf8"),
      requestId: requestParts.join("."),
    };
  } catch {
    return null;
  }
}

export class CorrelatedResponseRelay {
  private handlers = new Set<ResponseHandler>();

  constructor() {
    realtimeBackplane.on("bridge_correlated_response", (envelope) => {
      const payload = envelope.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
      const input = payload as Record<string, unknown>;
      if (
        typeof input.runtimeKey !== "string" ||
        typeof input.connectionGeneration !== "string" ||
        !input.message ||
        typeof input.message !== "object" ||
        Array.isArray(input.message)
      ) {
        return;
      }
      const response = {
        runtimeKey: input.runtimeKey,
        connectionGeneration: input.connectionGeneration,
        message: input.message as Record<string, unknown>,
      };
      for (const handler of this.handlers) handler(response);
    });
  }

  routeRequestId(commandType: unknown, requestId: string): string {
    if (typeof commandType !== "string" || !ROUTED_COMMAND_TYPES.has(commandType)) return requestId;
    return `${ROUTED_REQUEST_PREFIX}.${Buffer.from(realtimeBackplane.replicaId).toString("base64url")}.${requestId}`;
  }

  onResponse(handler: ResponseHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async forwardIfRemote(
    message: Record<string, unknown>,
    runtimeKey: string,
    connectionGeneration: string,
  ): Promise<boolean> {
    if (typeof message.type !== "string" || !RELAYED_RESPONSE_TYPES.has(message.type)) return false;
    if (typeof message.requestId !== "string") return false;
    const route = parseRoutedRequestId(message.requestId);
    if (!route || route.replicaId === realtimeBackplane.replicaId) return false;
    await realtimeBackplane.send(route.replicaId, "bridge_correlated_response", {
      runtimeKey,
      connectionGeneration,
      message: { ...message, requestId: route.requestId },
    });
    return true;
  }
}

export const correlatedResponseRelay = new CorrelatedResponseRelay();
