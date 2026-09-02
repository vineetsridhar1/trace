export class WorkspacePreparationBarrier {
  private current = new Map<string, Promise<boolean>>();

  track(sessionId: string, preparation: Promise<void>): void {
    // Convert rejection into data immediately. A preparation can fail before
    // any command waits on it; retaining the raw rejected promise would create
    // an unhandled rejection in that normal error path.
    const outcome = preparation.then(
      () => true,
      () => false,
    );
    this.current.set(sessionId, outcome);
  }

  async wait(sessionId: string): Promise<boolean> {
    while (true) {
      const outcome = this.current.get(sessionId);
      if (!outcome) return true;
      const succeeded = await outcome;
      if (this.current.get(sessionId) === outcome) return succeeded;
    }
  }

  clear(sessionId: string): void {
    this.current.delete(sessionId);
  }
}
