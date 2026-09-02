export class WorkspacePreparationBarrier {
  private current = new Map<string, Promise<boolean>>();

  track(workspaceKey: string, preparation: Promise<void>): void {
    // Convert rejection into data immediately. A preparation can fail before
    // any command waits on it; retaining the raw rejected promise would create
    // an unhandled rejection in that normal error path.
    const outcome = preparation.then(
      () => true,
      () => false,
    );
    this.current.set(workspaceKey, outcome);
  }

  async wait(workspaceKey: string): Promise<boolean> {
    while (true) {
      const outcome = this.current.get(workspaceKey);
      if (!outcome) return true;
      const succeeded = await outcome;
      if (this.current.get(workspaceKey) === outcome) return succeeded;
    }
  }

  clear(workspaceKey: string): void {
    this.current.delete(workspaceKey);
  }
}
