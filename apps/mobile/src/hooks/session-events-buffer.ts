import type { Event } from "@trace/gql";

export interface PendingFetchedEvents {
  events: Array<Event & { id: string }>;
  hasOlder: boolean;
  oldestTimestamp: string | null;
}

export interface FlushedBufferedSessionEvents {
  fetched: PendingFetchedEvents | null;
  error: string | null;
  liveEvents: Array<Event & { id: string }>;
}

export class SessionEventBuffer {
  private requestToken = 0;
  private pendingFetched: PendingFetchedEvents | null = null;
  private pendingLive: Array<Event & { id: string }> = [];
  private pendingError: string | null = null;

  beginFetch(): number {
    this.requestToken += 1;
    return this.requestToken;
  }

  invalidateFetches(): void {
    this.requestToken += 1;
    this.clear();
  }

  isCurrentRequest(requestToken: number): boolean {
    return requestToken === this.requestToken;
  }

  clearError(): void {
    this.pendingError = null;
  }

  storeFetched(requestToken: number, pending: PendingFetchedEvents): boolean {
    if (!this.isCurrentRequest(requestToken)) return false;
    this.pendingError = null;
    this.pendingFetched = pending;
    return true;
  }

  storeError(requestToken: number, error: string): boolean {
    if (!this.isCurrentRequest(requestToken)) return false;
    this.pendingFetched = null;
    this.pendingError = error;
    return true;
  }

  storeLiveEvent(event: Event & { id: string }): void {
    this.pendingLive.push(event);
  }

  flush(): FlushedBufferedSessionEvents {
    const flushed = {
      fetched: this.pendingFetched,
      error: this.pendingError,
      liveEvents: this.pendingLive,
    };
    this.clear();
    return flushed;
  }

  private clear(): void {
    this.pendingFetched = null;
    this.pendingLive = [];
    this.pendingError = null;
  }
}
