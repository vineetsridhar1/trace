import { redis, redisSub } from "./redis.js";
import { isLocalMode } from "./mode.js";

type SubscriptionHandler = (payload: unknown) => void;

interface TracePubSub {
  init(): void;
  publish<T>(topic: string, payload: T): void;
  asyncIterator<T>(topic: string): AsyncIterableIterator<T>;
}

abstract class BasePubSub implements TracePubSub {
  protected subscriptions = new Map<string, Set<SubscriptionHandler>>();

  publish<T>(_topic: string, _payload: T): void {}

  init(): void {}

  asyncIterator<T>(topic: string): AsyncIterableIterator<T> {
    const pullQueue: Array<(value: IteratorResult<T>) => void> = [];
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

    const existingHandlers = this.subscriptions.get(topic);
    if (existingHandlers) {
      existingHandlers.add(handler);
    } else {
      this.subscriptions.set(topic, new Set([handler]));
      this.onFirstSubscriber(topic);
    }

    const cleanup = () => {
      done = true;
      const handlers = this.subscriptions.get(topic);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.subscriptions.delete(topic);
          this.onLastSubscriber(topic);
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
        if (value !== undefined) return Promise.resolve({ value, done: false });
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

  protected dispatch(topic: string, payload: unknown): void {
    const handlers = this.subscriptions.get(topic);
    if (!handlers || handlers.size === 0) return;
    for (const handler of handlers) {
      handler(payload);
    }
  }

  protected onFirstSubscriber(_topic: string): void {}

  protected onLastSubscriber(_topic: string): void {}
}

class MemoryPubSub extends BasePubSub {
  override publish<T>(topic: string, payload: T): void {
    this.dispatch(topic, payload);
  }
}

class RedisPubSub extends BasePubSub {
  private initialized = false;

  private readonly messageHandler = (channel: string, message: string) => {
    try {
      this.dispatch(channel, JSON.parse(message));
    } catch (err) {
      console.error(`[pubsub] failed to parse message on ${channel}:`, err);
    }
  };

  override publish<T>(topic: string, payload: T): void {
    redis.publish(topic, JSON.stringify(payload)).catch((err: Error) => {
      console.error(`[pubsub] publish error on topic ${topic}:`, err.message);
    });
  }

  override init(): void {
    if (this.initialized) return;
    this.initialized = true;
    redisSub.on("message", this.messageHandler);
  }

  protected override onFirstSubscriber(topic: string): void {
    redisSub.subscribe(topic).catch((err: Error) => {
      console.error(`[pubsub] subscribe error on topic ${topic}:`, err.message);
    });
  }

  protected override onLastSubscriber(topic: string): void {
    redisSub.unsubscribe(topic).catch(() => {});
  }
}

export const pubsub: TracePubSub = isLocalMode() ? new MemoryPubSub() : new RedisPubSub();

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
