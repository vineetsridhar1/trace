export type WorkspaceState = "preparing" | "ready" | "failed";

function connectionRecord(connection: unknown): Record<string, unknown> {
  return connection && typeof connection === "object" && !Array.isArray(connection)
    ? (connection as Record<string, unknown>)
    : {};
}

export function workspaceState(connection: unknown): WorkspaceState | undefined {
  const state = connectionRecord(connection).workspaceState;
  return state === "preparing" || state === "ready" || state === "failed" ? state : undefined;
}

/**
 * Existing rows predate workspaceState, so a connected session with a workdir
 * remains ready during the rolling migration. Explicit preparing/failed state
 * always wins over a stale path.
 */
export function hasReadyWorkspace(
  connection: unknown,
  workdir: string | null | undefined,
): boolean {
  if (!workdir) return false;
  const record = connectionRecord(connection);
  const state = workspaceState(record);
  return record.state === "connected" && state !== "preparing" && state !== "failed";
}
