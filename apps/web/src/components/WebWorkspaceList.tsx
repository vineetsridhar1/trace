import { memo, useCallback, useMemo, useState } from "react";
import { FiPlus, FiCircle, FiExternalLink, FiChevronRight, FiFileText, FiEdit3, FiMap, FiHelpCircle } from "react-icons/fi";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useWorkspaceActions } from "../hooks/useWorkspaceActions";
import { useAgentRunStore } from "../stores/agentRunStore";
import { usePRStatus } from "../hooks/usePRStatus";
import { WebModelEffortSelector } from "./WebModelEffortSelector";
import type { TicketStatus } from "../types";

type InteractionMode = "code" | "plan" | "ask";

const MODE_CYCLE: InteractionMode[] = ["code", "plan", "ask"];
const MODE_CONFIG: Record<
  InteractionMode,
  { label: string; icon: React.ReactNode; style: string }
> = {
  code: {
    label: "Code",
    icon: <FiEdit3 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    style: "btn-secondary border-edge text-primary",
  },
  plan: {
    label: "Plan",
    icon: <FiMap className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    style: "border-accent bg-accent/20 text-accent-light",
  },
  ask: {
    label: "Ask",
    icon: <FiHelpCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    style: "border-amber-500 bg-amber-500/20 text-amber-300",
  },
};

const STATUS_DOT_COLOR: Record<TicketStatus, string> = {
  pending: "text-yellow-400",
  creation: "text-orange-400",
  in_progress: "text-green-400",
  completed: "text-gray-400",
  merged: "text-purple-400",
  needs_input: "text-amber-400",
  queued: "text-cyan-400",
  review: "text-teal-400",
  handed_off: "text-orange-300",
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-yellow-400" },
  creation: { label: "Creating", color: "text-orange-400" },
  in_progress: { label: "In Progress", color: "text-accent-light" },
  completed: { label: "Done", color: "text-green-400" },
  merged: { label: "Merged", color: "text-purple-400" },
  needs_input: { label: "Needs Input", color: "text-amber-400" },
  queued: { label: "Queued", color: "text-cyan-400" },
  review: { label: "In Review", color: "text-teal-400" },
  handed_off: { label: "Handed Off", color: "text-orange-300" },
};

const STATUS_GROUP_ORDER: TicketStatus[] = [
  "needs_input",
  "queued",
  "handed_off",
  "pending",
  "creation",
  "in_progress",
  "review",
  "merged",
];

interface WorkspaceItemData {
  id: string;
  status: TicketStatus;
  preview: string | null;
  ticketTitle: string | null;
  userName: string | null;
  branch: string | null;
  isProductDoc: boolean;
}

interface StatusGroup {
  status: TicketStatus;
  items: WorkspaceItemData[];
}

function CollapsibleStatusGroup({
  status,
  children,
  count,
}: {
  status: TicketStatus;
  children: React.ReactNode;
  count: number;
}) {
  const [open, setOpen] = useState(status !== "merged");
  const config = STATUS_CONFIG[status];

  return (
    <div>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 hover:bg-surface-elevated/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <FiChevronRight
          className={`h-3 w-3 text-muted transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        <div
          className={`h-2 w-2 flex-shrink-0 rounded-full ${config.color} bg-current`}
        />
        <span
          className={`text-[11px] font-semibold uppercase tracking-wide ${config.color}`}
        >
          {config.label}
        </span>
        <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted">
          {count}
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}

const PR_STATE_CONFIG: Record<string, { label: string; className: string }> = {
  open: { label: "PR", className: "bg-green-500/20 text-green-400" },
  merged: { label: "Merged", className: "bg-purple-500/20 text-purple-400" },
  closed: { label: "Closed", className: "bg-red-500/20 text-red-400" },
};

interface WebWorkspaceListProps {
  channelId: string;
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  repoPath?: string;
}

interface WorkspaceItemProps {
  id: string;
  status: TicketStatus;
  preview: string | null;
  ticketTitle: string | null;
  userName: string | null;
  prState?: string;
  prUrl?: string | null;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const WorkspaceItem = memo(
  function WorkspaceItem({ id, status, preview, ticketTitle, userName, prState, prUrl, isSelected, onSelect }: WorkspaceItemProps) {
    const dotColor = STATUS_DOT_COLOR[status] ?? STATUS_DOT_COLOR.pending;
    const displayText = ticketTitle || preview?.split("\n")[0] || "New Workspace";
    const prConfig = prState ? PR_STATE_CONFIG[prState] : null;

    return (
      <button
        type="button"
        onClick={() => onSelect(id)}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
          isSelected
            ? "bg-accent/20 text-primary"
            : "text-muted hover:bg-surface-elevated hover:text-primary"
        }`}
      >
        <FiCircle className={`mt-0.5 h-2.5 w-2.5 shrink-0 self-start fill-current ${dotColor}`} />
        <div className="min-w-0 flex-1">
          <span className="block truncate">{displayText}</span>
          {userName && (
            <span className="block truncate text-xs text-muted">{userName}</span>
          )}
        </div>
        {prConfig && (
          <span
            className={`shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${prConfig.className}`}
            onClick={(e) => {
              if (prUrl) {
                e.stopPropagation();
                window.open(prUrl, "_blank", "noopener,noreferrer");
              }
            }}
          >
            {prConfig.label}
            {prUrl && <FiExternalLink className="h-2.5 w-2.5" />}
          </span>
        )}
      </button>
    );
  },
  (prev, next) =>
    prev.status === next.status &&
    prev.preview === next.preview &&
    prev.ticketTitle === next.ticketTitle &&
    prev.userName === next.userName &&
    prev.prState === next.prState &&
    prev.prUrl === next.prUrl &&
    prev.isSelected === next.isSelected,
);

export function WebWorkspaceList({
  channelId,
  selectedWorkspaceId,
  onSelectWorkspace,
  repoPath,
}: WebWorkspaceListProps) {
  const allWorkspaces = useWorkspaceStore((s) => s.workspaces);
  const { createWorkspace, createWorkspaceAndSpawn } = useWorkspaceActions();

  const [showNewModal, setShowNewModal] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [startImmediately, setStartImmediately] = useState(true);
  const [mode, setMode] = useState<InteractionMode>("code");
  const [docsOpen, setDocsOpen] = useState(true);

  const selectedModel = useAgentRunStore((s) => s.selectedModel);
  const selectedEffort = useAgentRunStore((s) => s.selectedEffort);
  const setSelectedModel = useAgentRunStore((s) => s.setSelectedModel);
  const setSelectedEffort = useAgentRunStore((s) => s.setSelectedEffort);

  const handleSelect = useCallback(
    (id: string) => onSelectWorkspace(id),
    [onSelectWorkspace],
  );

  const cycleMode = useCallback(() => {
    setMode((m) => MODE_CYCLE[(MODE_CYCLE.indexOf(m) + 1) % MODE_CYCLE.length]);
  }, []);

  const handleCreate = useCallback(async () => {
    const prompt = newPrompt.trim();
    if (!prompt || creating) return;
    setCreating(true);
    try {
      let finalPrompt = prompt;
      if (startImmediately && mode === "plan") {
        finalPrompt = `Before implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.\n\n${prompt}`;
      } else if (startImmediately && mode === "ask") {
        finalPrompt = `<trace-internal>\nDo NOT modify any files. Only read files and answer questions. Do not use Edit, Write, or NotebookEdit tools. This is read-only/ask mode.\n</trace-internal>\n\n${prompt}`;
      }

      if (startImmediately) {
        const { workspaceId } = await createWorkspaceAndSpawn({
          channelId,
          prompt: finalPrompt,
          model: selectedModel,
          effort: selectedEffort,
          planMode: mode === "plan",
        });
        if (workspaceId) {
          setShowNewModal(false);
          setNewPrompt("");
          onSelectWorkspace(workspaceId);
        }
      } else {
        const { workspaceId } = await createWorkspace({ channelId, prompt });
        if (workspaceId) {
          setShowNewModal(false);
          setNewPrompt("");
          onSelectWorkspace(workspaceId);
        }
      }
    } finally {
      setCreating(false);
    }
  }, [newPrompt, creating, startImmediately, mode, selectedModel, selectedEffort, createWorkspace, createWorkspaceAndSpawn, channelId, onSelectWorkspace]);

  const items = useMemo(
    () =>
      allWorkspaces
        .filter((w) => w.channelId === channelId)
        .map((w) => ({
          id: w.id,
          status: w.status,
          preview: w.preview,
          ticketTitle: w.ticketTitle,
          userName: w.user?.name ?? null,
          branch: w.branch,
          isProductDoc: w.isProductDoc,
        })),
    [allWorkspaces, channelId],
  );

  const groupedItems = useMemo(() => {
    const buckets = new Map<TicketStatus, WorkspaceItemData[]>();
    for (const item of items) {
      if (item.isProductDoc) continue;
      let status = (item.status ?? "pending") as TicketStatus;
      if (status === "completed") status = "in_progress";
      let bucket = buckets.get(status);
      if (!bucket) {
        bucket = [];
        buckets.set(status, bucket);
      }
      bucket.push(item);
    }

    const groups: StatusGroup[] = [];
    for (const status of STATUS_GROUP_ORDER) {
      const groupItems = buckets.get(status);
      if (groupItems && groupItems.length > 0) {
        groups.push({ status, items: groupItems });
      }
    }
    return groups;
  }, [items]);

  const documentItems = useMemo(
    () => items.filter((item) => item.isProductDoc),
    [items],
  );

  const branches = useMemo(
    () => items.filter((w) => w.branch).map((w) => w.branch!),
    [items],
  );

  const { statuses: prStatuses } = usePRStatus(repoPath ?? null, branches);

  const prStatusByBranch = useMemo(() => {
    const map = new Map<string, { state: string; prUrl: string | null }>();
    for (const s of prStatuses) {
      if (s.state !== "none") {
        map.set(s.branch, { state: s.state, prUrl: s.prUrl });
      }
    }
    return map;
  }, [prStatuses]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <h2 className="text-sm font-medium text-primary">Workspaces</h2>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="rounded p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-primary"
        >
          <FiPlus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted">
            No workspaces yet
          </p>
        ) : (
          <>
            {groupedItems.map((group) => (
              <CollapsibleStatusGroup
                key={group.status}
                status={group.status}
                count={group.items.length}
              >
                {group.items.map((item) => {
                  const prInfo = item.branch ? prStatusByBranch.get(item.branch) : undefined;
                  return (
                    <WorkspaceItem
                      key={item.id}
                      id={item.id}
                      status={item.status}
                      preview={item.preview}
                      ticketTitle={item.ticketTitle}
                      userName={item.userName}
                      prState={prInfo?.state}
                      prUrl={prInfo?.prUrl}
                      isSelected={item.id === selectedWorkspaceId}
                      onSelect={handleSelect}
                    />
                  );
                })}
              </CollapsibleStatusGroup>
            ))}
            {documentItems.length > 0 && (
              <div>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 hover:bg-surface-elevated/50 transition-colors"
                  onClick={() => setDocsOpen((v) => !v)}
                >
                  <FiChevronRight
                    className={`h-3 w-3 text-muted transition-transform duration-150 ${docsOpen ? "rotate-90" : ""}`}
                  />
                  <FiFileText className="h-3 w-3 flex-shrink-0 text-blue-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-400">
                    Documents
                  </span>
                  <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    {documentItems.length}
                  </span>
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: docsOpen ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    {documentItems.map((item) => {
                      const prInfo = item.branch ? prStatusByBranch.get(item.branch) : undefined;
                      return (
                        <WorkspaceItem
                          key={item.id}
                          id={item.id}
                          status={item.status}
                          preview={item.preview}
                          ticketTitle={item.ticketTitle}
                          userName={item.userName}
                          prState={prInfo?.state}
                          prUrl={prInfo?.prUrl}
                          isSelected={item.id === selectedWorkspaceId}
                          onSelect={handleSelect}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-96 mx-4 rounded-lg border border-edge bg-surface-elevated p-4 shadow-xl">
            <h3 className="text-sm font-medium text-primary">
              New Workspace
            </h3>
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && newPrompt.trim() && !creating) {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="Describe what you'd like to work on..."
              className="mt-2 w-full rounded-md border border-edge bg-surface p-2 text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
              rows={4}
              autoFocus
            />
            <label className="mt-2 flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={startImmediately}
                onChange={(e) => setStartImmediately(e.target.checked)}
                className="accent-accent h-3.5 w-3.5"
              />
              <span className="text-xs text-primary">Start run immediately</span>
            </label>
            {startImmediately && (
              <div className="mt-2 flex items-center gap-1.5">
                <WebModelEffortSelector
                  model={selectedModel}
                  effort={selectedEffort}
                  onModelChange={setSelectedModel}
                  onEffortChange={setSelectedEffort}
                />
                <button
                  type="button"
                  onClick={cycleMode}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${MODE_CONFIG[mode].style}`}
                >
                  {MODE_CONFIG[mode].icon}
                  {MODE_CONFIG[mode].label}
                </button>
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={creating}
                onClick={() => {
                  setShowNewModal(false);
                  setNewPrompt("");
                }}
                className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newPrompt.trim() || creating}
                onClick={() => void handleCreate()}
                className="rounded-md bg-accent px-3 py-1.5 text-sm text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-50"
              >
                {creating ? "Starting…" : startImmediately ? "Create & Run" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
