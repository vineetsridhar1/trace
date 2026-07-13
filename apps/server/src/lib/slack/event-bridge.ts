import type { Event as PrismaEvent } from "@prisma/client";
import { prisma } from "../db.js";
import { pubsub, topics } from "../pubsub.js";
import { getSlackClient } from "./client.js";

type ThreadBinding = {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  assistantMessageTs?: string;
};

type EventEnvelope = { sessionEvents: PrismaEvent };

const TERMINAL_EVENT_TYPES = new Set(["session_deleted"]);

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractAssistantText(payload: Record<string, unknown>): string | null {
  if (payload.type !== "assistant") return null;
  const message = getObject(payload.message);
  const content = message?.content;
  if (!Array.isArray(content)) return null;

  const text = content
    .map((block) => {
      const item = getObject(block);
      return item?.type === "text" && typeof item.text === "string" ? item.text.trim() : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return text || null;
}

function truncateSlackText(text: string): string {
  const maxLength = 3500;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function quoteForSlack(text: string): string {
  return truncateSlackText(text)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function slackMessageTs(response: unknown): string | null {
  const result = getObject(response);
  return typeof result?.ts === "string" && result.ts ? result.ts : null;
}

async function actorDisplayName(actorId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true, email: true },
  });
  return user?.name?.trim() || user?.email?.trim() || "A Trace user";
}

function traceSessionUrl(input: {
  channelId: string | null;
  sessionGroupId: string | null;
  sessionId: string;
}): string | null {
  const base = process.env.TRACE_WEB_URL?.replace(/\/$/, "");
  if (!base) return null;
  const groupPart = input.sessionGroupId ? `/g/${input.sessionGroupId}` : "";
  const sessionPart = `/s/${input.sessionId}`;
  if (input.channelId && input.sessionGroupId) {
    return `${base}/c/${input.channelId}${groupPart}${sessionPart}`;
  }
  if (input.sessionGroupId) {
    return `${base}${groupPart}${sessionPart}`;
  }
  return `${base}${sessionPart}`;
}

export async function buildTraceSessionLink(sessionId: string): Promise<string | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, channelId: true, sessionGroupId: true },
  });
  if (!session) return null;
  return traceSessionUrl({
    channelId: session.channelId,
    sessionGroupId: session.sessionGroupId,
    sessionId: session.id,
  });
}

class SlackEventBridgeManager {
  private active = new Map<string, ThreadBinding>();
  private cancellers = new Map<string, () => void>();
  private activeGroups = new Map<string, ThreadBinding>();
  private groupCancellers = new Map<string, () => void>();

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

  attachGroup(sessionGroupId: string, binding: ThreadBinding): void {
    if (this.activeGroups.has(sessionGroupId)) return;
    this.activeGroups.set(sessionGroupId, binding);

    const iterator = pubsub.asyncIterator<EventEnvelope>(topics.sessionEvents(sessionGroupId));
    let cancelled = false;
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      iterator.return?.().catch(() => {});
    };
    this.groupCancellers.set(sessionGroupId, cancel);

    void (async () => {
      try {
        for await (const envelope of iterator) {
          if (cancelled) break;
          const event = envelope?.sessionEvents;
          if (!event) continue;
          const posted = await this.handleGroupEvent(event, binding);
          if (posted) {
            this.detachGroup(sessionGroupId);
            break;
          }
        }
      } catch (err) {
        console.warn(
          `[slack-bridge] group iterator error for ${sessionGroupId}:`,
          (err as Error).message,
        );
        this.detachGroup(sessionGroupId);
      }
    })();
  }

  detachGroup(sessionGroupId: string): void {
    const canceller = this.groupCancellers.get(sessionGroupId);
    this.groupCancellers.delete(sessionGroupId);
    this.activeGroups.delete(sessionGroupId);
    if (canceller) canceller();
  }

  private async handleGroupEvent(event: PrismaEvent, binding: ThreadBinding): Promise<boolean> {
    if (event.eventType !== "session_endpoint_forwarding_enabled") return false;
    const payload = getObject(event.payload);
    const endpoint = getObject(payload?.endpoint);
    const url = typeof endpoint?.url === "string" ? endpoint.url : null;
    if (!url) return false;
    const label = typeof endpoint?.label === "string" ? endpoint.label : "Application";
    await this.post(binding, `🔗 *${label}* is live: <${url}|open>`);
    return true;
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

    if (event.eventType === "message_sent" && event.actorType === "user") {
      binding.assistantMessageTs = undefined;
      if (payload.clientSource === "slack") return;
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!text) return;
      const actorName = await actorDisplayName(event.actorId);
      await this.post(binding, `*${actorName} sent a message in Trace:*\n${quoteForSlack(text)}`);
      return;
    }

    if (event.eventType === "session_output") {
      const text = extractAssistantText(payload);
      if (!text) return;
      await this.postOrUpdateAssistant(binding, text);
      return;
    }

    if (event.eventType === "session_terminated") {
      const link = await buildTraceSessionLink(sessionId);
      await this.post(binding, link ? `🔴 Session ended. <${link}|Open in Trace>` : "🔴 Session ended.");
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
        reply_broadcast: false,
      })
      .catch((err: unknown) => {
        console.warn("[slack-bridge] failed to post message:", (err as Error).message);
      });
  }

  private async postOrUpdateAssistant(binding: ThreadBinding, text: string): Promise<void> {
    const client = await getSlackClient(binding.slackTeamId);
    if (!client) return;

    if (binding.assistantMessageTs) {
      const updated = await client.chat
        .update({
          channel: binding.slackChannelId,
          ts: binding.assistantMessageTs,
          text,
        })
        .then(() => true)
        .catch((err: unknown) => {
          console.warn(
            "[slack-bridge] failed to update assistant message:",
            (err as Error).message,
          );
          return false;
        });
      if (updated) return;

      binding.assistantMessageTs = undefined;
    }

    const response = await client.chat
      .postMessage({
        channel: binding.slackChannelId,
        thread_ts: binding.slackThreadTs,
        text,
        mrkdwn: true,
        reply_broadcast: false,
      })
      .catch((err: unknown) => {
        console.warn("[slack-bridge] failed to post assistant message:", (err as Error).message);
        return null;
      });
    binding.assistantMessageTs = slackMessageTs(response) ?? undefined;
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
