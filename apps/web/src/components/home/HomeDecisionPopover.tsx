import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { SEND_SESSION_MESSAGE_MUTATION, useEntityStore } from "@trace/client-core";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { timeAgo } from "../../lib/utils";
import type { HomeWorkItem } from "./home-work-data";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export function HomeDecisionPopover({ item }: { item: HomeWorkItem }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const details = useMemo(() => decisionDetails(item), [item]);

  const respond = async (approved: boolean) => {
    if (!item.sessionId || sending) return;
    setSending(true);
    const store = useEntityStore.getState();
    const previous = store.sessions[item.sessionId];
    store.patch("sessions", item.sessionId, {
      sessionStatus: "in_progress",
      ...(approved ? { agentStatus: "active" } : {}),
    });

    const result = await client
      .mutation(SEND_SESSION_MESSAGE_MUTATION, {
        sessionId: item.sessionId,
        text: approved
          ? "Approved. Continue with this plan."
          : "Denied. Do not proceed with this plan.",
      })
      .toPromise();

    if (result.error) {
      if (previous) store.upsert("sessions", item.sessionId, previous);
      toast.error(`Could not ${approved ? "approve" : "deny"} request`, {
        description: result.error.message,
      });
    } else {
      setOpen(false);
    }
    setSending(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={(event: MouseEvent) => event.stopPropagation()}
        className="btn-primary rounded-md px-3 py-1 text-[11.5px] font-medium"
      >
        Approve
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={7}
        onClick={(event: MouseEvent) => event.stopPropagation()}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key !== "Enter" || event.target instanceof HTMLButtonElement) return;
          event.preventDefault();
          void respond(true);
        }}
        className="w-[min(340px,calc(100vw-2rem))] gap-0 border border-[var(--th-edge-strong)] bg-[var(--th-raised)] p-3.5 shadow-[0_16px_48px_rgb(0_0_0/0.55)]"
      >
        <h3 className="text-[13px] font-semibold text-[var(--th-heading)]">{details.title}</h3>
        {details.additions.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {details.additions.map((addition) => (
              <li key={addition} className="flex gap-2 text-xs text-[var(--th-primary)]">
                <span className="font-mono text-[var(--th-success)]">+</span>
                <span>{addition}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2.5 text-[11px] text-[var(--th-muted)]">
          {item.repoName ?? "Trace workspace"} · paused{" "}
          {item.inboxItem ? timeAgo(item.inboxItem.createdAt) : "recently"} · resumes on approve
        </p>
        <div className="mt-3 flex items-center gap-2 border-t border-[var(--th-edge)] pt-3">
          <span className="mr-auto hidden text-[10px] text-[var(--th-faint)] sm:inline">
            ⏎ approve · esc dismiss
          </span>
          <button
            type="button"
            disabled={sending}
            onClick={() => void respond(false)}
            className="btn-secondary rounded-md border border-[var(--th-edge-hover)] px-2.5 py-1 text-[11px] text-foreground disabled:opacity-50"
          >
            Deny
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void respond(true)}
            className="btn-primary rounded-md px-2.5 py-1 text-[11px] disabled:opacity-50"
          >
            {sending ? "Sending…" : "Approve"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function decisionDetails(item: HomeWorkItem): { title: string; additions: string[] } {
  const payload = item.inboxItem?.payload;
  const planContent =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof payload.planContent === "string"
      ? payload.planContent
      : "";
  const additions = planContent
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 3);
  return {
    title: item.inboxItem?.title ?? "Approve this direction?",
    additions,
  };
}
