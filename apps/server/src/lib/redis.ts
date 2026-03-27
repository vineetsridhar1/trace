import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * Create a new Redis client. Exported so other processes (e.g. agent worker)
 * can create their own dedicated connections.
 */
export function createRedisClient(name: string): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // required for blocking reads (XREAD)
    lazyConnect: true,
    connectionName: name,
  });

  client.on("error", (err) => {
    console.error(`[redis:${name}] connection error:`, err.message);
  });

  client.on("connect", () => {
    console.log(`[redis:${name}] connected to ${REDIS_URL}`);
  });

  return client;
}

/**
 * General-purpose Redis client for pub/sub publishing, XADD, and commands.
 * Do NOT use this for subscribing — subscribers need a dedicated connection.
 */
export const redis = createRedisClient("main");

/**
 * Dedicated subscriber connection. Once a Redis client enters subscribe mode
 * it can only run (P)SUBSCRIBE/(P)UNSUBSCRIBE commands — so we need a separate client.
 */
export const redisSub = createRedisClient("subscriber");

/**
 * Connect both clients. Call once at server startup.
 */
export async function connectRedis(): Promise<void> {
  await Promise.all([redis.connect(), redisSub.connect()]);
}

/**
 * Gracefully disconnect both clients. Call on server shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  redis.disconnect();
  redisSub.disconnect();
}

/**
 * Pub/Sub channel used to wake the agent worker when a direct-route event
 * (DM, @mention, ticket assignment) is published. The worker subscribes on
 * a dedicated connection and uses the signal to break out of idle sleep,
 * picking up the event within ~50-100ms instead of waiting up to BLOCK_MS.
 */
export const AGENT_WAKE_CHANNEL = "agent:wake";
