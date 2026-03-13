import { EventEmitter } from "events";

/**
 * Simple in-memory pub-sub for event broadcasting.
 * Sufficient for single-process dev. Replace with Redis pub-sub for multi-process prod.
 */
class PubSub {
  private emitter = new EventEmitter();

  publish<T>(topic: string, payload: T): void {
    this.emitter.emit(topic, payload);
  }

  /**
   * Returns an AsyncIterableIterator for use in GraphQL subscription resolvers.
   */
  asyncIterator<T>(topic: string): AsyncIterableIterator<T> {
    const emitter = this.emitter;
    const pullQueue: ((value: IteratorResult<T>) => void)[] = [];
    const pushQueue: T[] = [];
    let done = false;

    const handler = (payload: T) => {
      const resolve = pullQueue.shift();
      if (resolve) {
        resolve({ value: payload, done: false });
      } else {
        pushQueue.push(payload);
      }
    };

    emitter.on(topic, handler);

    return {
      next(): Promise<IteratorResult<T>> {
        if (done) return Promise.resolve({ value: undefined as T, done: true });
        const value = pushQueue.shift();
        if (value) return Promise.resolve({ value, done: false });
        return new Promise((resolve) => pullQueue.push(resolve));
      },
      return(): Promise<IteratorResult<T>> {
        done = true;
        emitter.off(topic, handler);
        for (const resolve of pullQueue) {
          resolve({ value: undefined as T, done: true });
        }
        pullQueue.length = 0;
        pushQueue.length = 0;
        return Promise.resolve({ value: undefined as T, done: true });
      },
      throw(error: Error): Promise<IteratorResult<T>> {
        done = true;
        emitter.off(topic, handler);
        return Promise.reject(error);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }
}

export const pubsub = new PubSub();

// Standard topic builders
export const topics = {
  channelEvents: (channelId: string) => `channel:${channelId}:events`,
  sessionEvents: (sessionId: string) => `session:${sessionId}:events`,
  ticketEvents: (ticketId: string) => `ticket:${ticketId}:events`,
  userNotifications: (orgId: string, userId: string) => `org:${orgId}:user:${userId}:notifications`,
  sessionStatus: (sessionId: string) => `session:${sessionId}:status`,
  sessionPorts: (sessionId: string) => `session:${sessionId}:ports`,
} as const;
