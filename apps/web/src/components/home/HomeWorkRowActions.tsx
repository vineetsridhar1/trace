import { useState, type MouseEvent } from "react";
import { RUN_SESSION_MUTATION, useEntityStore } from "@trace/client-core";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { navigateToSession, useUIStore } from "../../stores/ui";
import type { HomeWorkItem } from "./home-work-data";
import { HomeDecisionPopover } from "./HomeDecisionPopover";

export function HomeWorkRowActions({ item }: { item: HomeWorkItem }) {
  const [running, setRunning] = useState(false);
  const setActivePage = useUIStore((state) => state.setActivePage);
  const failed = item.agentStatus === "failed";
  const stopped = item.agentStatus === "stopped";

  const openSession = (event?: MouseEvent) => {
    event?.stopPropagation();
    if (item.sessionId) {
      navigateToSession(item.channelId, item.groupId, item.sessionId);
    } else {
      setActivePage("inbox");
    }
  };

  const restart = async (event: MouseEvent) => {
    event.stopPropagation();
    if (!item.sessionId || running) return;
    setRunning(true);
    const store = useEntityStore.getState();
    const previous = store.sessions[item.sessionId];
    store.patch("sessions", item.sessionId, {
      agentStatus: "active",
      sessionStatus: "in_progress",
    });
    const result = await client.mutation(RUN_SESSION_MUTATION, { id: item.sessionId }).toPromise();
    if (result.error) {
      if (previous) store.upsert("sessions", item.sessionId, previous);
      toast.error(failed ? "Could not retry session" : "Could not resume session", {
        description: result.error.message,
      });
    }
    setRunning(false);
  };

  if (failed) {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          disabled={running}
          onClick={(event) => void restart(event)}
          className="btn-secondary rounded-md border border-[var(--th-edge-hover)] px-2.5 py-1 text-[11px] text-foreground disabled:opacity-50"
        >
          {running ? "Retrying…" : "Retry"}
        </button>
        <button
          type="button"
          onClick={openSession}
          className="px-1 py-1 text-[11px] text-[var(--th-muted)] hover:text-foreground"
        >
          Logs
        </button>
      </span>
    );
  }

  if (stopped) {
    return (
      <button
        type="button"
        disabled={running}
        onClick={(event) => void restart(event)}
        className="btn-secondary shrink-0 rounded-md border border-[var(--th-edge-hover)] px-2.5 py-1 text-[11px] text-foreground disabled:opacity-50"
      >
        {running ? "Resuming…" : "Resume"}
      </button>
    );
  }

  if (item.bucket !== "needs_you") return null;

  if (item.inboxItem?.itemType === "plan" && item.sessionId) {
    return <HomeDecisionPopover item={item} />;
  }

  return (
    <button
      type="button"
      onClick={openSession}
      className="btn-secondary shrink-0 rounded-md border border-[var(--th-edge-hover)] px-2.5 py-1 text-[11px] text-foreground"
    >
      Review
    </button>
  );
}
