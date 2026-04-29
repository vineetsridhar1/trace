import type { UltraplanHumanGateResolution } from "@trace/gql";
import {
  GitBranch,
  GitCommit,
  MessageSquare,
  ExternalLink,
  Workflow,
  FileDiff,
} from "lucide-react";
import { navigateToSession, navigateToSessionGroup } from "../../stores/ui";

interface InboxUltraplanGateBodyProps {
  payload: Record<string, unknown>;
  summary?: string | null;
  sending: boolean;
  onResolve: (resolution: UltraplanHumanGateResolution) => void;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function linksFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const links = payload.links;
  return links && typeof links === "object" && !Array.isArray(links)
    ? (links as Record<string, unknown>)
    : {};
}

export function InboxUltraplanGateBody({
  payload,
  summary,
  sending,
  onResolve,
}: InboxUltraplanGateBodyProps) {
  const recommendedAction =
    typeof payload.recommendedAction === "string" ? payload.recommendedAction : null;
  const branchName = optionalString(payload.branchName);
  const checkpointSha = optionalString(payload.checkpointSha);
  const qaChecklist = stringList(payload.qaChecklist);
  const sessionGroupId = optionalString(payload.sessionGroupId);
  const workerSessionId = optionalString(payload.workerSessionId);
  const controllerRunSessionId = optionalString(payload.controllerRunSessionId);
  const ticketId = optionalString(payload.ticketId);
  const links = linksFromPayload(payload);
  const controllerRunUrl = optionalString(links.controllerRunUrl);
  const workerSessionUrl = optionalString(links.workerSessionUrl);
  const diffUrl = optionalString(links.diffUrl);
  const prUrl = optionalString(links.prUrl);

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-3 px-4 pb-4">
      {summary || recommendedAction ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          {summary ? <p>{summary}</p> : null}
          {recommendedAction ? (
            <p>
              <span className="font-medium text-foreground">Recommended:</span> {recommendedAction}
            </p>
          ) : null}
        </div>
      ) : null}

      {branchName || checkpointSha || ticketId || qaChecklist.length > 0 ? (
        <div className="space-y-1 rounded-md border border-border/60 bg-surface-deep px-3 py-2 text-xs">
          {branchName ? (
            <div className="flex gap-2">
              <GitBranch size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-foreground">{branchName}</span>
            </div>
          ) : null}
          {checkpointSha ? (
            <div className="flex gap-2">
              <GitCommit size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-foreground">{checkpointSha}</span>
            </div>
          ) : null}
          {ticketId ? (
            <div className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">Ticket</span>
              <span className="min-w-0 truncate text-foreground">{ticketId}</span>
            </div>
          ) : null}
          {qaChecklist.length > 0 ? (
            <div className="pt-1 text-muted-foreground">
              {qaChecklist.map((item) => (
                <div key={item} className="truncate">
                  {item}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {sessionGroupId ||
      workerSessionId ||
      controllerRunSessionId ||
      controllerRunUrl ||
      workerSessionUrl ||
      diffUrl ||
      prUrl ? (
        <div className="flex flex-wrap gap-2">
          {sessionGroupId ? (
            <button
              type="button"
              onClick={() => navigateToSessionGroup(null, sessionGroupId)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            >
              <Workflow size={12} />
              Group
            </button>
          ) : null}
          {workerSessionId && sessionGroupId ? (
            <button
              type="button"
              onClick={() => navigateToSession(null, sessionGroupId, workerSessionId)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            >
              <MessageSquare size={12} />
              Worker
            </button>
          ) : null}
          {controllerRunSessionId && sessionGroupId ? (
            <button
              type="button"
              onClick={() => navigateToSession(null, sessionGroupId, controllerRunSessionId)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            >
              <MessageSquare size={12} />
              Controller
            </button>
          ) : null}
          {diffUrl ? (
            <button
              type="button"
              onClick={() => openExternal(diffUrl)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            >
              <FileDiff size={12} />
              Diff
            </button>
          ) : null}
          {prUrl ? (
            <button
              type="button"
              onClick={() => openExternal(prUrl)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            >
              <ExternalLink size={12} />
              PR
            </button>
          ) : null}
          {controllerRunUrl ? (
            <button
              type="button"
              onClick={() => openExternal(controllerRunUrl)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            >
              <ExternalLink size={12} />
              Controller link
            </button>
          ) : null}
          {workerSessionUrl ? (
            <button
              type="button"
              onClick={() => openExternal(workerSessionUrl)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            >
              <ExternalLink size={12} />
              Worker link
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={sending}
          onClick={() => onResolve("approved")}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => onResolve("changes_requested")}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-elevated disabled:opacity-50"
        >
          Request changes
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => onResolve("dismissed")}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-elevated disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
