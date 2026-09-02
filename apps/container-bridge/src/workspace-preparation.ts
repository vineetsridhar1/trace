export class WorkspacePreparationTracker {
  private active = new Map<string, Promise<void>>();

  track(sessionId: string, preparation: Promise<void>): void {
    this.active.set(sessionId, preparation);
  }

  async wait(sessionId: string): Promise<boolean> {
    while (true) {
      const preparation = this.active.get(sessionId);
      if (!preparation) return true;
      try {
        await preparation;
      } catch {
        if (this.active.get(sessionId) === preparation) return false;
      }
      const next = this.active.get(sessionId);
      if (!next || next === preparation) return true;
    }
  }

  clear(sessionId: string): void {
    this.active.delete(sessionId);
  }
}
