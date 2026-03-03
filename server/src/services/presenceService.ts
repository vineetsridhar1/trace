interface PresenceEntry {
  workspaceId: string;
  userName: string;
  avatarUrl: string | null;
  lastSeen: number;
}

// channelId → userId → PresenceEntry
const presenceMap = new Map<string, Map<string, PresenceEntry>>();

const STALE_THRESHOLD_MS = 90_000;

export function setPresence(
  channelId: string,
  userId: string,
  workspaceId: string,
  userName: string,
  avatarUrl: string | null,
): { changed: boolean } {
  let channelMap = presenceMap.get(channelId);
  if (!channelMap) {
    channelMap = new Map();
    presenceMap.set(channelId, channelMap);
  }

  const existing = channelMap.get(userId);
  const changed = !existing || existing.workspaceId !== workspaceId;

  channelMap.set(userId, { workspaceId, userName, avatarUrl, lastSeen: Date.now() });
  return { changed };
}

export function clearPresence(
  channelId: string,
  userId: string,
): string | null {
  const channelMap = presenceMap.get(channelId);
  if (!channelMap) return null;

  const existing = channelMap.get(userId);
  if (!existing) return null;

  channelMap.delete(userId);
  if (channelMap.size === 0) presenceMap.delete(channelId);

  return existing.workspaceId;
}

export interface PresenceViewer {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface WorkspacePresenceEntry {
  workspaceId: string;
  viewers: PresenceViewer[];
}

export function getChannelPresence(channelId: string): WorkspacePresenceEntry[] {
  const channelMap = presenceMap.get(channelId);
  if (!channelMap) return [];

  const byWorkspace = new Map<string, PresenceViewer[]>();

  for (const [userId, entry] of channelMap) {
    let viewers = byWorkspace.get(entry.workspaceId);
    if (!viewers) {
      viewers = [];
      byWorkspace.set(entry.workspaceId, viewers);
    }
    viewers.push({ userId, name: entry.userName, avatarUrl: entry.avatarUrl });
  }

  const result: WorkspacePresenceEntry[] = [];
  for (const [workspaceId, viewers] of byWorkspace) {
    result.push({ workspaceId, viewers });
  }
  return result;
}

// Evict stale entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [channelId, channelMap] of presenceMap) {
    for (const [userId, entry] of channelMap) {
      if (now - entry.lastSeen > STALE_THRESHOLD_MS) {
        channelMap.delete(userId);
      }
    }
    if (channelMap.size === 0) presenceMap.delete(channelId);
  }
}, 60_000);
