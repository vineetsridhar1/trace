import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import type { CodingToolOperation } from "../../stores/coding-tools";
import { CodingToolMark } from "../desktop/CodingToolMark";
import { CODING_TOOL_PRESENTATION } from "../desktop/coding-tool-presentation";
import { CodingToolExecutableDetails } from "./CodingToolExecutableDetails";

export function CodingToolSettingsRow({
  status,
  operation,
  failure,
  recentlyUpdated,
  onAction,
  onChooseExecutable,
  onClearExecutable,
}: {
  status: DesktopCodingToolStatus;
  operation?: CodingToolOperation;
  failure?: string;
  recentlyUpdated: boolean;
  onAction: () => void;
  onChooseExecutable: () => void;
  onClearExecutable: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const presentation = CODING_TOOL_PRESENTATION[status.tool];
  if (!presentation) return null;

  const meta = failure
    ? { label: "Update failed", glyph: "!", tone: "text-[#ef4444]" }
    : operation
      ? {
          label: operation === "installing" ? "Installing" : "Updating",
          glyph: "◐",
          tone: "text-[#3b82f6]",
        }
      : status.status === "update_available"
        ? { label: "Update available", glyph: "↑", tone: "text-[#f59e0b]" }
        : status.status === "missing"
          ? { label: "Not installed", glyph: "+", tone: "text-[#a1a1aa]" }
          : {
              label: recentlyUpdated ? "Updated" : "Up to date",
              glyph: "✓",
              tone: "text-[#22c55e]",
            };
  const actionLabel = failure
    ? "Retry"
    : operation
      ? "Working…"
      : status.status === "update_available"
        ? "Update"
        : status.status === "missing"
          ? status.executableOverride
            ? null
            : "Install"
          : null;

  return (
    <div>
      <div className="flex min-w-0 items-center gap-4 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]"
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-[#a1a1aa] transition-transform",
              expanded && "rotate-90",
            )}
          />
          <CodingToolMark
            shape={presentation.shape}
            label={status.label}
            dimmed={status.status === "missing"}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[#fafafa]">
              {status.label}
            </span>
            <span className="mt-0.5 block truncate font-mono text-xs text-[#a1a1aa]">
              {presentation.command}
            </span>
          </span>
        </button>
        <span className="w-[90px] shrink-0 font-mono text-xs text-[#a1a1aa]">
          {presentation.size}
        </span>
        <span className="w-[160px] shrink-0 font-mono text-xs">
          {status.status === "update_available" ? (
            <>
              <span className="text-[#a1a1aa]">{status.installedVersion ?? "?"}</span>
              <span className="text-[#a1a1aa]"> → </span>
              <span className="text-[#fafafa]">{status.latestVersion ?? "latest"}</span>
            </>
          ) : (
            <span className="text-[#a1a1aa]">
              {status.installedVersion ??
                (status.latestVersion ? `${status.latestVersion} available` : "—")}
            </span>
          )}
        </span>
        <span className={cn("flex w-[150px] shrink-0 items-center gap-1.5 text-xs", meta.tone)}>
          <span aria-hidden="true" className="leading-none">
            {meta.glyph}
          </span>
          {meta.label}
        </span>
        <span className="flex w-[104px] shrink-0 justify-end">
          {actionLabel ? (
            <button
              type="button"
              disabled={Boolean(operation)}
              onClick={onAction}
              className="inline-flex h-8 items-center rounded-lg border border-[#3f3f46] bg-[#18181b] px-3 text-[13px] font-semibold text-[#fafafa] transition-colors hover:border-[#a1a1aa] disabled:opacity-50"
            >
              {actionLabel}
            </button>
          ) : (
            <span className="text-xs text-[#a1a1aa]">—</span>
          )}
        </span>
      </div>
      {failure ? (
        <p className="border-t border-[#3f3f46] bg-[#ef4444]/10 px-4 py-2.5 pl-16 text-xs leading-5 text-[#fafafa]">
          <span className="mr-1.5 font-semibold text-[#ef4444]">!</span>
          {failure}
        </p>
      ) : null}
      {expanded ? (
        <CodingToolExecutableDetails
          status={status}
          onChooseExecutable={onChooseExecutable}
          onClearExecutable={onClearExecutable}
        />
      ) : null}
    </div>
  );
}
