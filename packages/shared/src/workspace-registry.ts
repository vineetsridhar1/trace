/**
 * Workspace paths are owned by session groups. Sessions only bind an agent to
 * that shared workspace. Sessions without a group retain a private workspace.
 *
 * The ReadonlyMap surface lets existing file and process helpers resolve a
 * workdir by session ID without making session ID the storage authority.
 */
export class WorkspaceRegistry implements ReadonlyMap<string, string> {
  private readonly workdirs = new Map<string, string>();
  private readonly sessionGroupIds = new Map<string, string>();

  get size(): number {
    let size = 0;
    for (const _entry of this.entries()) size += 1;
    return size;
  }

  bind(sessionId: string, sessionGroupId?: string | null): void {
    const previousGroupId = this.sessionGroupIds.get(sessionId);
    if (sessionGroupId) {
      this.sessionGroupIds.set(sessionId, sessionGroupId);
    } else {
      this.sessionGroupIds.delete(sessionId);
    }
    if (previousGroupId && previousGroupId !== sessionGroupId) {
      this.deleteGroupIfUnbound(previousGroupId);
    }
  }

  set(sessionId: string, workdir: string): void {
    this.workdirs.set(this.workspaceKey(sessionId), workdir);
  }

  get(sessionId: string): string | undefined {
    return this.workdirs.get(this.workspaceKey(sessionId));
  }

  has(sessionId: string): boolean {
    return this.get(sessionId) !== undefined;
  }

  /** Invalidate the shared workspace without forgetting session bindings. */
  deleteWorkspace(sessionId: string): boolean {
    return this.workdirs.delete(this.workspaceKey(sessionId));
  }

  /** Forget one agent binding without deleting a sibling's shared workspace. */
  deleteSession(sessionId: string): void {
    const sessionGroupId = this.sessionGroupIds.get(sessionId);
    if (!sessionGroupId) {
      this.workdirs.delete(this.workspaceKey(sessionId));
    }
    this.sessionGroupIds.delete(sessionId);
    if (sessionGroupId) this.deleteGroupIfUnbound(sessionGroupId);
  }

  workspaceKey(sessionId: string): string {
    const sessionGroupId = this.sessionGroupIds.get(sessionId);
    return sessionGroupId ? `group:${sessionGroupId}` : `session:${sessionId}`;
  }

  forEach(
    callbackfn: (value: string, key: string, map: ReadonlyMap<string, string>) => void,
    thisArg?: unknown,
  ): void {
    for (const [sessionId, workdir] of this.entries()) {
      callbackfn.call(thisArg, workdir, sessionId, this);
    }
  }

  *entries(): MapIterator<[string, string]> {
    for (const sessionId of this.sessionIds()) {
      const workdir = this.get(sessionId);
      if (workdir !== undefined) yield [sessionId, workdir];
    }
  }

  *keys(): MapIterator<string> {
    for (const [sessionId] of this.entries()) yield sessionId;
  }

  *values(): MapIterator<string> {
    for (const [, workdir] of this.entries()) yield workdir;
  }

  [Symbol.iterator](): MapIterator<[string, string]> {
    return this.entries();
  }

  private sessionIds(): string[] {
    const ids = new Set(this.sessionGroupIds.keys());
    for (const key of this.workdirs.keys()) {
      if (key.startsWith("session:")) ids.add(key.slice("session:".length));
    }
    return [...ids];
  }

  private deleteGroupIfUnbound(sessionGroupId: string): void {
    if (![...this.sessionGroupIds.values()].includes(sessionGroupId)) {
      this.workdirs.delete(`group:${sessionGroupId}`);
    }
  }
}
