import { randomUUID } from "node:crypto";
import os from "node:os";
import { isLocalMode } from "./mode.js";
import { pubsub } from "./pubsub.js";
import { redis } from "./redis.js";

const BACKPLANE_VERSION = 1 as const;
const INBOX_PREFIX = "trace:replica:v1";
const BROADCAST_TOPIC = "trace:replicas:v1:broadcast";
const CHUNK_KIND = "__backplane_chunk";
const MAX_CHUNK_BYTES = 256 * 1024;
const CHUNK_TTL_MS = 30_000;

export type BackplaneEnvelope = {
  version: typeof BACKPLANE_VERSION;
  id: string;
  kind: string;
  sourceReplicaId: string;
  sentAt: number;
  payload: unknown;
};

type BackplaneHandler = (envelope: BackplaneEnvelope) => Promise<void> | void;

function enabledFromEnvironment(): boolean {
  if (isLocalMode()) return false;
  const value = process.env.TRACE_REALTIME_BACKPLANE_ENABLED;
  return value === "1" || value === "true";
}

function createReplicaId(): string {
  const configured = process.env.TRACE_REPLICA_ID?.trim();
  if (configured) return configured;
  return `${os.hostname()}:${process.pid}:${randomUUID()}`;
}

function isEnvelope(value: unknown): value is BackplaneEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === BACKPLANE_VERSION &&
    typeof candidate.id === "string" &&
    typeof candidate.kind === "string" &&
    typeof candidate.sourceReplicaId === "string" &&
    typeof candidate.sentAt === "number"
  );
}

export class RealtimeBackplane {
  readonly replicaId = createReplicaId();
  readonly enabled = enabledFromEnvironment();

  private handlers = new Map<string, Set<BackplaneHandler>>();
  private inboxIterator: AsyncIterableIterator<unknown> | null = null;
  private broadcastIterator: AsyncIterableIterator<unknown> | null = null;
  private started = false;
  private chunkTransfers = new Map<
    string,
    { chunks: Array<string | undefined>; received: number; timer: NodeJS.Timeout }
  >();

  on(kind: string, handler: BackplaneHandler): () => void {
    const handlers = this.handlers.get(kind) ?? new Set<BackplaneHandler>();
    handlers.add(handler);
    this.handlers.set(kind, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.handlers.delete(kind);
    };
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (!this.enabled) return;

    this.inboxIterator = pubsub.asyncIterator(this.inboxTopic(this.replicaId));
    this.broadcastIterator = pubsub.asyncIterator(BROADCAST_TOPIC);
    await Promise.all([
      pubsub.waitForSubscription(this.inboxTopic(this.replicaId)),
      pubsub.waitForSubscription(BROADCAST_TOPIC),
    ]);
    void this.consume(this.inboxIterator);
    void this.consume(this.broadcastIterator);
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    const iterators = [this.inboxIterator, this.broadcastIterator];
    this.inboxIterator = null;
    this.broadcastIterator = null;
    for (const transfer of this.chunkTransfers.values()) clearTimeout(transfer.timer);
    this.chunkTransfers.clear();
    await Promise.all(iterators.map((iterator) => iterator?.return?.() ?? Promise.resolve()));
  }

  async send(targetReplicaId: string, kind: string, payload: unknown): Promise<void> {
    const envelope = this.envelope(kind, payload);
    if (targetReplicaId === this.replicaId) {
      await this.dispatch(envelope);
      return;
    }
    if (!this.enabled) throw new Error("Realtime backplane is disabled");
    await this.publish(this.inboxTopic(targetReplicaId), envelope);
  }

  async broadcast(kind: string, payload: unknown): Promise<void> {
    const envelope = this.envelope(kind, payload);
    if (!this.enabled) {
      await this.dispatch(envelope);
      return;
    }
    await this.publish(BROADCAST_TOPIC, envelope);
  }

  private inboxTopic(replicaId: string): string {
    return `${INBOX_PREFIX}:${replicaId}`;
  }

  private envelope(kind: string, payload: unknown): BackplaneEnvelope {
    return {
      version: BACKPLANE_VERSION,
      id: randomUUID(),
      kind,
      sourceReplicaId: this.replicaId,
      sentAt: Date.now(),
      payload,
    };
  }

  private async consume(iterator: AsyncIterableIterator<unknown>): Promise<void> {
    try {
      for await (const value of iterator) {
        if (!this.started) return;
        if (!isEnvelope(value)) {
          console.warn("[backplane] ignored malformed envelope");
          continue;
        }
        await this.dispatch(value);
      }
    } catch (error) {
      if (!this.started) return;
      console.error(
        "[backplane] inbox consumer failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async dispatch(envelope: BackplaneEnvelope): Promise<void> {
    if (envelope.kind === CHUNK_KIND) {
      await this.acceptChunk(envelope);
      return;
    }
    const handlers = this.handlers.get(envelope.kind);
    if (!handlers) return;
    for (const handler of handlers) await handler(envelope);
  }

  private async publish(topic: string, envelope: BackplaneEnvelope): Promise<void> {
    const serialized = JSON.stringify(envelope);
    if (Buffer.byteLength(serialized) <= MAX_CHUNK_BYTES) {
      await redis.publish(topic, serialized);
      return;
    }

    const transferId = randomUUID();
    const encoded = Buffer.from(serialized).toString("base64");
    const chunkSize = Math.floor((MAX_CHUNK_BYTES * 3) / 4) - 1024;
    const total = Math.ceil(encoded.length / chunkSize);
    for (let index = 0; index < total; index += 1) {
      const chunk = this.envelope(CHUNK_KIND, {
        transferId,
        index,
        total,
        data: encoded.slice(index * chunkSize, (index + 1) * chunkSize),
      });
      await redis.publish(topic, JSON.stringify(chunk));
    }
  }

  private async acceptChunk(envelope: BackplaneEnvelope): Promise<void> {
    const payload = envelope.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    const input = payload as Record<string, unknown>;
    if (
      typeof input.transferId !== "string" ||
      typeof input.index !== "number" ||
      typeof input.total !== "number" ||
      typeof input.data !== "string" ||
      input.total < 1 ||
      input.total > 10_000 ||
      input.index < 0 ||
      input.index >= input.total
    ) {
      return;
    }
    let transfer = this.chunkTransfers.get(input.transferId);
    if (!transfer) {
      const timer = setTimeout(
        () => this.chunkTransfers.delete(input.transferId as string),
        CHUNK_TTL_MS,
      );
      timer.unref();
      transfer = { chunks: new Array<string | undefined>(input.total), received: 0, timer };
      this.chunkTransfers.set(input.transferId, transfer);
    }
    if (transfer.chunks.length !== input.total || transfer.chunks[input.index] !== undefined)
      return;
    transfer.chunks[input.index] = input.data;
    transfer.received += 1;
    if (transfer.received !== input.total) return;
    clearTimeout(transfer.timer);
    this.chunkTransfers.delete(input.transferId);
    try {
      const decoded = Buffer.from(transfer.chunks.join(""), "base64").toString("utf8");
      const complete = JSON.parse(decoded) as unknown;
      if (isEnvelope(complete)) await this.dispatch(complete);
    } catch {
      console.warn("[backplane] ignored malformed chunk transfer");
    }
  }
}

export const realtimeBackplane = new RealtimeBackplane();
