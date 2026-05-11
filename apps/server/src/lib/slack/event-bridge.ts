import type { Event as PrismaEvent } from "@prisma/client";
import { prisma } from "../db.js";
import { pubsub, topics } from "../pubsub.js";
import { getSlackClient } from "./client.js";

type ThreadBinding = {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
};

type EventEnvelope = { sessionEvents: PrismaEvent };

const TERMINAL_EVENT_TYPES = new Set(["session_terminated", "session_deleted"]);

class SlackEventBridgeManager {
  private active = new Map<string, ThreadBinding>();
  private cancellers = new Map<string, () => void>();

  attach(sessionId: string, binding: ThreadBinding): void {
    if (this.active.has(sessionId)) return;
    this.active.set(sessionId, binding);

    const iterator = pubsub.asyncIterator<EventEnvelope>(topics.sessionEvents(sessionId));
    let cancelled = false;

    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      iterator.return?.().catch(() => {});
    };
    this.cancellers.set(sessionId, cancel);

    void (async () => {
      try {
        for await (const envelope of iterator) {
          if (cancelled) break;
          const event = envelope?.sessionEvents;
          if (!event) continue;
          await this.handleEvent(sessionId, event, binding);
          if (TERMINAL_EVENT_TYPES.has(event.eventType)) {
            this.detach(sessionId);
            break;
          }
        }
      } catch (err) {
        console.warn(
          `[slack-bridge] iterator error for session ${sessionId}:`,
          (err as Error).message,
        );
        this.detach(sessionId);
      }
    })();
  }

  detach(sessionId: string): void {
    const canceller = this.cancellers.get(sessionId);
    this.cancellers.delete(sessionId);
    this.active.delete(sessionId);
    if (canceller) canceller();
  }

  isAttached(sessionId: string): boolean {
    return this.active.has(sessionId);
  }

  private async handleEvent(
    sessionId: string,
    event: PrismaEvent,
    binding: ThreadBinding,
  ): Promise<void> {
    const payload =
      event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : {};

    if (event.eventType === "message_sent" && event.actorType === "agent") {
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!text) return;
      await this.post(binding, text);
      return;
    }

    if (event.eventType === "session_terminated") {
      await this.post(binding, "🔴 Session ended.");
      return;
    }

    if (event.eventType === "session_paused") {
      await this.post(binding, "⏸ Session paused.");
      return;
    }

    if (event.eventType === "session_runtime_start_failed") {
      const reason =
        typeof payload.reason === "string"
          ? payload.reason
          : typeof payload.error === "string"
            ? payload.error
            : "unknown error";
      await this.post(binding, `⚠️ Failed to start runtime: ${reason}`);
      return;
    }
  }

  private async post(binding: ThreadBinding, text: string): Promise<void> {
    const client = await getSlackClient(binding.slackTeamId);
    if (!client) return;
    await client.chat
      .postMessage({
        channel: binding.slackChannelId,
        thread_ts: binding.slackThreadTs,
        text,
        mrkdwn: true,
      })
      .catch((err: unknown) => {
        console.warn("[slack-bridge] failed to post message:", (err as Error).message);
      });
  }

  async rehydrate(): Promise<void> {
    const threads = await prisma.slackThreadSession.findMany({
      where: {
        session: { agentStatus: { in: ["not_started", "active"] } },
      },
      select: {
        sessionId: true,
        slackTeamId: true,
        slackChannelId: true,
        slackThreadTs: true,
      },
    });
    for (const t of threads) {
      this.attach(t.sessionId, {
        slackTeamId: t.slackTeamId,
        slackChannelId: t.slackChannelId,
        slackThreadTs: t.slackThreadTs,
      });
    }
    if (threads.length > 0) {
      console.log(`[slack-bridge] rehydrated ${threads.length} active thread session(s)`);
    }
  }
}

export const slackEventBridge = new SlackEventBridgeManager();
