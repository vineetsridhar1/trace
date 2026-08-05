import { useState } from "react";
import { Check, ChevronRight, CircleAlert, LoaderCircle, Plus, Upload } from "lucide-react";
import { getCodingToolCli } from "@trace/shared";
import { cn } from "../../lib/utils";
import type { CodingToolOperation } from "../../stores/coding-tools";
import { CodingToolMark } from "../desktop/CodingToolMark";
import { CODING_TOOL_PRESENTATION } from "../desktop/coding-tool-presentation";
import { Button } from "../ui/button";

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
    ? { label: "Update failed", icon: CircleAlert, tone: "text-destructive" }
    : operation
      ? {
          label: operation === "installing" ? "Installing" : "Updating",
          icon: LoaderCircle,
          tone: "text-blue-400",
        }
      : status.status === "update_available"
        ? { label: "Update available", icon: Upload, tone: "text-amber-400" }
        : status.status === "missing"
          ? { label: "Not installed", icon: Plus, tone: "text-muted-foreground" }
          : {
              label: recentlyUpdated ? "Updated" : "Up to date",
              icon: Check,
              tone: "text-emerald-400",
            };
  const StatusIcon = meta.icon;
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
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
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
              <span className="truncate text-sm font-semibold text-foreground">{status.label}</span>
              {presentation.primary ? (
                <span className="rounded border border-border px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Primary
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
              {presentation.command}
            </span>
          </span>
        </button>
        <span className="w-[90px] shrink-0 font-mono text-xs text-muted-foreground">
          {presentation.size}
        </span>
        <span className="w-[160px] shrink-0 font-mono text-xs">
          {status.status === "update_available" ? (
            <>
              <span className="text-muted-foreground">{status.installedVersion ?? "?"}</span>
              <span className="text-muted-foreground"> → </span>
              <span className="text-foreground">{status.latestVersion ?? "latest"}</span>
            </>
          ) : (
            <span className="text-muted-foreground">
              {status.installedVersion ??
                (status.latestVersion ? `${status.latestVersion} available` : "—")}
            </span>
          )}
        </span>
        <span className={cn("flex w-[150px] shrink-0 items-center gap-1.5 text-xs", meta.tone)}>
          <StatusIcon className={cn("size-3.5", operation && "animate-spin")} />
          {meta.label}
        </span>
        <span className="flex w-[104px] shrink-0 justify-end">
          {actionLabel ? (
            <Button size="sm" variant="outline" disabled={Boolean(operation)} onClick={onAction}>
              {actionLabel}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </span>
      </div>
      {failure ? (
        <p className="border-t border-border bg-destructive/10 px-4 py-2.5 pl-16 text-xs leading-5 text-foreground">
          <span className="mr-1.5 font-semibold text-destructive">!</span>
          {failure}
        </p>
      ) : null}
      {expanded ? (
        <div className="border-t border-border bg-surface-elevated/40 px-4 py-3.5 pl-16">
          <dl className="flex flex-wrap gap-x-10 gap-y-2.5">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Source
              </dt>
              <dd className="mt-0.5 font-mono text-xs text-foreground">
                {cli?.install ?? "Managed externally"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Powers
              </dt>
              <dd className="mt-0.5 text-xs text-foreground">{status.label} sessions</dd>
            </div>
          </dl>
          {cli ? (
            <a
              href={cli.installUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs font-semibold text-blue-400 underline-offset-2 hover:underline"
            >
              Installation documentation
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
