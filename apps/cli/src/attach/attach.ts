import { createInterface } from "node:readline";
import type { Event } from "@trace/gql";
import {
  HIDDEN_SESSION_PAYLOAD_TYPES,
  buildSessionNodes,
  eventScopeKey,
  handleSessionEvent,
  optimisticallyInsertSessionMessage,
  removeOptimisticSessionMessage,
} from "@trace/client-core/headless";
import { SESSION_EVENTS_SUBSCRIPTION, SESSION_TIMELINE_QUERY } from "../documents.js";
import { queueSessionPrompt, sendSessionPrompt } from "../mutations.js";
import { requireActiveOrg, resolveSessionByIdPrefix } from "../resolve.js";
import { createClientRuntime } from "../runtime.js";
import { appendDelta, renderTranscriptLines } from "./render.js";

const SEED_PAGE_SIZE = 50;

interface TimelineItem {
  kind: string;
  event: (Event & { id: string }) | null;
}

export interface AttachOptions {
  serverUrl: string;
  idPrefix: string;
  json: boolean;
}

export async function attachToSession(options: AttachOptions): Promise<void> {
  const orgId = requireActiveOrg();
  const resolved = await resolveSessionByIdPrefix(options.serverUrl, orgId, options.idPrefix);
  const scopeKey = eventScopeKey("session", resolved.id);

  const runtime = createClientRuntime({ serverUrl: options.serverUrl });
  await runtime.start();

  // Seed: one bounded page of recent history through the shared handlers.
  const seed = await runtime.gql
    .query(SESSION_TIMELINE_QUERY, {
      organizationId: orgId,
      sessionId: resolved.id,
      limit: SEED_PAGE_SIZE,
      excludePayloadTypes: HIDDEN_SESSION_PAYLOAD_TYPES,
    })
    .toPromise();
  if (seed.error) {
    await runtime.dispose();
    throw new Error(`Failed to load session timeline: ${seed.error.message}`);
  }
  const items =
    (seed.data as { sessionTimeline?: { items?: TimelineItem[] } } | undefined)?.sessionTimeline
      ?.items ?? [];
  for (const item of items) {
    if (item.kind === "event" && item.event) {
      handleSessionEvent(resolved.id, item.event);
    }
  }

  // Live: keep feeding the same handler.
  const subscription = runtime.gql
    .subscription(SESSION_EVENTS_SUBSCRIPTION, { sessionId: resolved.id, organizationId: orgId })
    .subscribe((result) => {
      if (result.error) {
        console.error(`[attach] subscription error: ${result.error.message}`);
      }
      const event = (result.data as { sessionEvents?: Event & { id: string } } | undefined)
        ?.sessionEvents;
      if (event) {
        handleSessionEvent(resolved.id, event);
      }
    });

  let renderedLines: string[] = [];
  let renderedNodeCount = 0;
  let lastStatusLine = "";

  const renderStatus = () => {
    if (options.json) return;
    const session = runtime.stores.entity.getState().sessions[resolved.id];
    const name = session?.name ?? resolved.name;
    const tool = session?.tool ? ` [${session.tool}]` : "";
    const agentStatus = session?.agentStatus ?? resolved.agentStatus;
    const sessionStatus = session?.sessionStatus ? ` ${session.sessionStatus}` : "";
    const line = `— ${name}${tool} ${agentStatus}${sessionStatus} —`;
    if (line !== lastStatusLine) {
      console.log(line);
      lastStatusLine = line;
    }
  };

  const renderTranscript = () => {
    const state = runtime.stores.entity.getState();
    const ids = state._eventIdsByScope[scopeKey] ?? [];
    const events = state.eventsByScope[scopeKey] ?? {};
    if (options.json) {
      const { nodes } = buildSessionNodes(ids, events);
      for (let index = renderedNodeCount; index < nodes.length; index += 1) {
        console.log(JSON.stringify(nodes[index]));
      }
      renderedNodeCount = Math.max(renderedNodeCount, nodes.length);
      return;
    }
    const lines = renderTranscriptLines(ids, events);
    for (const line of appendDelta(renderedLines, lines)) {
      console.log(line);
    }
    renderedLines = lines;
  };

  renderStatus();
  renderTranscript();
  const unsubscribeStore = runtime.stores.entity.subscribe(() => {
    renderStatus();
    renderTranscript();
  });

  // stdin lines become prompts with an optimistic echo that reconciles when
  // the canonical event returns (matched on clientMutationId).
  const readline = createInterface({ input: process.stdin });
  readline.on("line", (line) => {
    const text = line.trim();
    if (!text) return;
    const session = runtime.stores.entity.getState().sessions[resolved.id];
    const agentStatus = session?.agentStatus ?? resolved.agentStatus;
    void (async () => {
      try {
        if (agentStatus === "active") {
          await queueSessionPrompt(runtime.gql, resolved.id, text);
          if (!options.json) console.error("[attach] queued (agent is busy)");
          return;
        }
        const optimistic = optimisticallyInsertSessionMessage(resolved.id, text);
        try {
          await sendSessionPrompt(runtime.gql, resolved.id, text, {
            clientMutationId: optimistic.clientMutationId,
          });
        } catch (error) {
          removeOptimisticSessionMessage(resolved.id, optimistic.eventId);
          throw error;
        }
      } catch (error) {
        console.error(
          `[attach] prompt failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    })();
  });

  // Ctrl-C detaches; the session keeps running.
  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve());
    readline.once("close", () => resolve());
  });

  unsubscribeStore();
  subscription.unsubscribe();
  readline.close();
  await runtime.dispose();
}
