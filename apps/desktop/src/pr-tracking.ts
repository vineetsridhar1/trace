export type TrackedSessionWorkspace = {
  sessionIds: string[];
  workdir: string;
};

export function collectTrackedPrWorkspaces(
  sessionWorkdirs: ReadonlyMap<string, string>,
  sessionGroupIds: ReadonlyMap<string, string | null>,
): TrackedSessionWorkspace[] {
  const workspaces = new Map<string, TrackedSessionWorkspace>();

  for (const [sessionId, workdir] of sessionWorkdirs.entries()) {
    const sessionGroupId = sessionGroupIds.get(sessionId) ?? null;
    const workspaceKey = sessionGroupId ? `group:${sessionGroupId}` : `workdir:${workdir}`;
    const trackedWorkspace = workspaces.get(workspaceKey);
    if (trackedWorkspace) {
      trackedWorkspace.sessionIds.push(sessionId);
      continue;
    }
    workspaces.set(workspaceKey, { sessionIds: [sessionId], workdir });
  }

  return [...workspaces.values()];
}
