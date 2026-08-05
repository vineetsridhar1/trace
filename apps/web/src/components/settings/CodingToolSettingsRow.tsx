import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { getCodingToolCli } from "@trace/shared";
import { cn } from "../../lib/utils";
import type { CodingToolOperation } from "../../stores/coding-tools";
import { CodingToolMark } from "../desktop/CodingToolMark";
import { CODING_TOOL_PRESENTATION } from "../desktop/coding-tool-presentation";

export function CodingToolSettingsRow({
  status,
  operation,
  failure,
  recentlyUpdated,
  onAction,
}: {
  status: DesktopCodingToolStatus;
  operation?: CodingToolOperation;
  failure?: string;
  recentlyUpdated: boolean;
  onAction: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const presentation = CODING_TOOL_PRESENTATION[status.tool];
  const cli = getCodingToolCli(status.tool);
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
          ? "Install"
          : null;

  return (
    <div>
      <div className="flex min-w-[760px] items-center gap-4 px-4 py-3">
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
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-[#fafafa]">{status.label}</span>
              {presentation.primary ? (
                <span className="rounded border border-[#3f3f46] px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a1a1aa]">
                  Primary
                </span>
              ) : null}
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
        <div className="border-t border-[#3f3f46] bg-[#18181b] px-4 py-3.5 pl-16">
          <dl className="flex flex-wrap gap-x-10 gap-y-2.5">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a1a1aa]">
                Source
              </dt>
              <dd className="mt-0.5 font-mono text-xs text-[#fafafa]">
                {cli?.install ?? "Managed externally"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a1a1aa]">
                Powers
              </dt>
              <dd className="mt-0.5 text-xs text-[#fafafa]">{status.label} sessions</dd>
            </div>
          </dl>
          {cli ? (
            <a
              href={cli.installUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs font-semibold text-[#3b82f6] underline-offset-2 hover:underline"
            >
              Installation documentation
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
