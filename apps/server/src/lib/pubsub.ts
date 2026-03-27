import { redis, redisSub } from "./redis.js";

/**
 * Redis-backed pub-sub for event broadcasting.
 * Drop-in replacement for the previous EventEmitter-based implementation.
 * Supports multi-process communication (server + agent worker).
 */
class PubSub {
  private subscriptions = new Map<string, Set<(payload: unknown) => void>>();

  /**
   * Publish a payload to a topic. Serializes to JSON and sends via Redis.
   */
  publish<T>(topic: string, payload: T): void {
    redis.publish(topic, JSON.stringify(payload)).catch((err) => {
      console.error(`[pubsub] publish error on topic ${topic}:`, err.message);
    });
  }

  /**
   * Returns an AsyncIterableIterator for use in GraphQL subscription resolvers.
   * Each call creates a dedicated listener on the Redis subscriber connection.
   */
  asyncIterator<T>(topic: string): AsyncIterableIterator<T> {
    const pullQueue: ((value: IteratorResult<T>) => void)[] = [];
    const pushQueue: T[] = [];
    let done = false;

    const handler = (payload: unknown) => {
      if (done) return;
      const resolve = pullQueue.shift();
      if (resolve) {
        resolve({ value: payload as T, done: false });
      } else {
        pushQueue.push(payload as T);
      }
    };

    // Track this handler so the shared message listener can dispatch to it
    let handlers = this.subscriptions.get(topic);
    if (!handlers) {
      handlers = new Set();
      this.subscriptions.set(topic, handlers);
      // First subscriber for this topic — tell Redis to subscribe
      redisSub.subscribe(topic).catch((err) => {
        console.error(`[pubsub] subscribe error on topic ${topic}:`, err.message);
      });
    }
    handlers.add(handler);

    const cleanup = () => {
      done = true;
      const h = this.subscriptions.get(topic);
      if (h) {
        h.delete(handler);
        if (h.size === 0) {
          this.subscriptions.delete(topic);
          redisSub.unsubscribe(topic).catch(() => {});
        }
      }
      for (const resolve of pullQueue) {
        resolve({ value: undefined as T, done: true });
      }
      pullQueue.length = 0;
      pushQueue.length = 0;
    };

    return {
      next(): Promise<IteratorResult<T>> {
        if (done) return Promise.resolve({ value: undefined as T, done: true });
        const value = pushQueue.shift();
        if (value) return Promise.resolve({ value, done: false });
        return new Promise((resolve) => pullQueue.push(resolve));
      },
      return(): Promise<IteratorResult<T>> {
        cleanup();
        return Promise.resolve({ value: undefined as T, done: true });
      },
      throw(error: Error): Promise<IteratorResult<T>> {
        cleanup();
        return Promise.reject(error);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  /**
   * Initialize the shared message listener on the subscriber connection.
   * Call once at server startup after Redis is connected.
   */
  init(): void {
    redisSub.on("message", (channel: string, message: string) => {
      const handlers = this.subscriptions.get(channel);
      if (!handlers || handlers.size === 0) return;
      try {
        const payload = JSON.parse(message);
        for (const handler of handlers) {
          handler(payload);
        }
      } catch (err) {
        console.error(`[pubsub] failed to parse message on ${channel}:`, err);
      }
    });
  }
}

export const pubsub = new PubSub();

// Standard topic builders
export const topics = {
  channelEvents: (channelId: string) => `channel:${channelId}:events`,
  chatEvents: (chatId: string) => `chat:${chatId}:events`,
  ticketEvents: (ticketId: string) => `ticket:${ticketId}:events`,
  userNotifications: (orgId: string, userId: string) => `org:${orgId}:user:${userId}:notifications`,
  orgEvents: (orgId: string) => `org:${orgId}:events`,
  sessionStatus: (sessionId: string) => `session:${sessionId}:status`,
  sessionPorts: (sessionId: string) => `session:${sessionId}:ports`,
  branchTurns: (branchId: string) => `branch:${branchId}:turns`,
  conversationEvents: (conversationId: string) => `conversation:${conversationId}:events`,
  sessionEvents: (sessionId: string) => `session:${sessionId}:events`,
} as const;
