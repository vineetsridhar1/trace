import { useState } from "react";
import { Check, LoaderCircle, Plus, X } from "lucide-react";
import { createQuickSession } from "../../lib/create-quick-session";
import { cn } from "../../lib/utils";
import { useCodingToolsStore } from "../../stores/coding-tools";
import { useUIStore } from "../../stores/ui";
import { CodingToolMark } from "../desktop/CodingToolMark";
import { CODING_TOOL_PRESENTATION } from "../desktop/coding-tool-presentation";
import { TOOL_OPTIONS, type ToolOptionValue } from "../session/picker/pickerShared";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function StartSessionDialog({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ToolOptionValue>("claude_code");
  const [starting, setStarting] = useState(false);
  const statuses = useCodingToolsStore((state) => state.statuses);
  const operations = useCodingToolsStore((state) => state.operations);
  const installOrUpdate = useCodingToolsStore((state) => state.installOrUpdate);
  const missingCount = statuses?.filter((status) => status.status === "missing").length ?? 0;

  async function startSession() {
    setStarting(true);
    await createQuickSession(channelId, { tool: selected });
    setStarting(false);
    setOpen(false);
  }

  function openSettings() {
    setOpen(false);
    useUIStore.getState().setSettingsInitialTab("coding-tools");
    useUIStore.getState().setActivePage("settings");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <DialogTrigger
            aria-label="New session (⌘N)"
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          >
            <Plus size={16} />
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>New session (⌘N)</TooltipContent>
      </Tooltip>

      <DialogContent
        showCloseButton={false}
        className="w-[760px] max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[12px] border border-[#3f3f46] bg-[#18181b] p-0 text-[#fafafa] shadow-[0_16px_48px_rgb(0_0_0/0.24)] ring-0 sm:max-w-[760px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#3f3f46] px-5 py-4">
          <div>
            <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em] text-[#fafafa]">
              New session
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-[#a1a1aa]">
              Choose how you want to work in this project.
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close new session dialog"
            className="-mr-1.5 -mt-1 flex size-8 items-center justify-center rounded-lg text-[#a1a1aa] hover:bg-[#09090b] hover:text-[#fafafa]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 items-start gap-2.5 px-5 py-4">
          {TOOL_OPTIONS.map((option) => {
            const status = statuses?.find((candidate) => candidate.tool === option.value);
            const missing = status?.status === "missing";
            const installing = operations[option.value] === "installing";
            const presentation = CODING_TOOL_PRESENTATION[option.value];
            if (!presentation) return null;
            return (
              <div
                key={option.value}
                className={cn(
                  "rounded-[12px] border p-3.5 transition-colors",
                  selected === option.value ? "border-[#3b82f6] bg-[#09090b]" : "border-[#3f3f46]",
                  missing && "border-dashed",
                )}
              >
                <button
                  type="button"
                  disabled={missing}
                  aria-pressed={selected === option.value}
                  onClick={() => setSelected(option.value)}
                  className="flex w-full items-start gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6] disabled:cursor-not-allowed"
                >
                  <CodingToolMark
                    shape={presentation.shape}
                    label={option.label}
                    dimmed={missing}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[13px] font-semibold",
                        missing ? "text-[#a1a1aa]" : "text-[#fafafa]",
                      )}
                    >
                      {option.label}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs text-[#a1a1aa]">
                      {missing
                        ? "Not installed"
                        : `Runs on ${status?.installedVersion ?? "installed version"}`}
                    </span>
                  </span>
                  {selected === option.value && !missing ? (
                    <Check className="size-4 text-[#3b82f6]" />
                  ) : null}
                </button>
                {missing ? (
                  <div className="mt-3 flex items-center gap-2 border-t border-[#3f3f46] pt-3">
                    <button
                      type="button"
                      disabled={installing}
                      onClick={() => void installOrUpdate(option.value).catch(() => undefined)}
                      className="inline-flex h-7 items-center rounded-lg border border-[#3f3f46] bg-[#18181b] px-2.5 text-xs font-semibold text-[#fafafa] hover:border-[#a1a1aa] disabled:opacity-50"
                    >
                      {installing ? <LoaderCircle className="size-3.5 animate-spin" /> : "Install"}
                    </button>
                    <span className="font-mono text-[11px] text-[#a1a1aa]">
                      {status?.latestVersion ?? "Latest"} · {presentation.size}
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#3f3f46] px-5 py-3.5">
          <p className="text-xs leading-5 text-[#a1a1aa]">
            {missingCount} tools are not installed on this computer.{" "}
            <button
              type="button"
              onClick={openSettings}
              className="font-semibold text-[#3b82f6] underline-offset-2 hover:underline"
            >
              Manage coding tools
            </button>
          </p>
          <button
            type="button"
            disabled={starting}
            onClick={() => void startSession()}
            className="inline-flex h-8 shrink-0 items-center rounded-lg bg-[#fafafa] px-3.5 text-[13px] font-semibold text-[#09090b] hover:opacity-90 disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start session"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
