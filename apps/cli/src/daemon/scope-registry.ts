export type ScopeOpener = (scopeType: string, scopeId: string) => () => void;

interface ScopeEntry {
  count: number;
  close: () => void;
}

/** Refcounted viewport subscriptions: the first subscriber opens the
 *  underlying GraphQL subscription, the last unsubscriber closes it. */
export class ScopeRegistry {
  private readonly entries = new Map<string, ScopeEntry>();

  constructor(private readonly open: ScopeOpener) {}

  private key(scopeType: string, scopeId: string): string {
    return `${scopeType}:${scopeId}`;
  }

  subscribe(scopeType: string, scopeId: string): number {
    const key = this.key(scopeType, scopeId);
    const existing = this.entries.get(key);
    if (existing) {
      existing.count += 1;
      return existing.count;
    }
    const close = this.open(scopeType, scopeId);
    this.entries.set(key, { count: 1, close });
    return 1;
  }

  unsubscribe(scopeType: string, scopeId: string): number {
    const key = this.key(scopeType, scopeId);
    const existing = this.entries.get(key);
    if (!existing) return 0;
    existing.count -= 1;
    if (existing.count <= 0) {
      this.entries.delete(key);
      existing.close();
      return 0;
    }
    return existing.count;
  }

  disposeAll(): void {
    for (const entry of this.entries.values()) {
      entry.close();
    }
    this.entries.clear();
  }
}
