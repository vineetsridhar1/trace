import { useState } from "react";
import { cn } from "../lib/cn";
import { ToolMark } from "./ToolMark";
import { allTools, type Tool } from "./toolsData";

const SOURCE = "src/design/components/NewSessionPicker.tsx";

function typeBlurb(tool: Tool): string {
  return tool.state === "missing" ? "Not installed" : `Runs on ${tool.version}`;
}

function SessionTypeCard({
  tool,
  selected,
  onSelect,
}: {
  tool: Tool;
  selected: boolean;
  onSelect: () => void;
}) {
  const missing = tool.state === "missing";

  return (
    <div
      data-trace-id={`session-type-${tool.id}`}
      data-trace-source={SOURCE}
      className={cn(
        "rounded-design-surface border p-3.5 transition duration-design ease-design",
        selected ? "border-design-secondary bg-design-background" : "border-design-border",
        missing && "border-dashed",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={missing}
        aria-pressed={selected}
        data-trace-id={`session-type-${tool.id}-select`}
        data-trace-source={SOURCE}
        className="flex w-full items-start gap-3 rounded-design-control text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary disabled:cursor-not-allowed"
      >
        <ToolMark shape={tool.shape} label={tool.name} dimmed={missing} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[13px] font-semibold",
              missing ? "text-design-muted" : "text-design-foreground",
            )}
          >
            {tool.name}
          </span>
          <span className="mt-0.5 block font-design-mono text-xs text-design-muted">
            {typeBlurb(tool)}
          </span>
        </span>
        {selected ? (
          <span aria-hidden="true" className="shrink-0 text-sm text-design-secondary">
            ✓
          </span>
        ) : null}
      </button>
      {missing ? (
        <div className="mt-3 flex items-center gap-2 border-t border-design-border pt-3">
          <button
            type="button"
            data-trace-id={`session-type-${tool.id}-install`}
            data-trace-source={SOURCE}
            className="inline-flex h-7 items-center rounded-design-control border border-design-border bg-design-surface px-2.5 text-xs font-semibold text-design-foreground transition duration-design ease-design hover:border-design-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary"
          >
            Install
          </button>
          <span className="font-design-mono text-[11px] text-design-muted">
            {tool.latest} · {tool.size}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The contextual catch: a missing tool is surfaced where the user actually feels
 * it, instead of in a dialog at launch.
 */
export function NewSessionPicker({ onClose }: { onClose?: () => void }) {
  const [selected, setSelected] = useState("claude-code");

  return (
    <div
      data-trace-id="new-session-overlay"
      data-trace-source={SOURCE}
      className="absolute inset-0 z-20 flex items-center justify-center px-8"
      style={{ backgroundColor: "color-mix(in srgb, var(--design-color-background) 72%, transparent)" }}
    >
      <div
        role="dialog"
        aria-label="New session"
        data-trace-id="new-session-dialog"
        data-trace-source={SOURCE}
        className="w-[760px] rounded-design-surface border border-design-border bg-design-surface shadow-design-surface"
      >
        <div
          data-trace-id="new-session-header"
          data-trace-source={SOURCE}
          className="flex items-start justify-between gap-4 border-b border-design-border px-5 py-4"
        >
          <div>
            <h2 className="font-design-display text-[15px] font-semibold tracking-[-0.01em] text-design-foreground">
              New session
            </h2>
            <p className="mt-0.5 text-xs text-design-muted">
              Choose how you want to work in wavelength.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new session dialog"
            data-trace-id="new-session-close"
            data-trace-source={SOURCE}
            className="-mr-1.5 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-design-control text-design-muted transition duration-design ease-design hover:bg-design-background hover:text-design-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary"
          >
            <span aria-hidden="true" className="text-base leading-none">
              ✕
            </span>
          </button>
        </div>
        <div
          data-trace-id="new-session-grid"
          data-trace-source={SOURCE}
          className="grid grid-cols-3 items-start gap-2.5 px-5 py-4"
        >
          {allTools.map((tool) => (
            <SessionTypeCard
              key={tool.id}
              tool={tool}
              selected={selected === tool.id}
              onSelect={() => setSelected(tool.id)}
            />
          ))}
        </div>
        <div
          data-trace-id="new-session-footer"
          data-trace-source={SOURCE}
          className="flex items-center justify-between gap-3 border-t border-design-border px-5 py-3.5"
        >
          <p className="text-xs leading-5 text-design-muted">
            2 tools are not installed on this computer.{" "}
            <a
              href="#settings-coding-tools"
              data-trace-id="new-session-tools-link"
              data-trace-source={SOURCE}
              className="font-semibold text-design-secondary underline-offset-2 hover:underline"
            >
              Manage coding tools
            </a>
          </p>
          <button
            type="button"
            data-trace-id="new-session-start"
            data-trace-source={SOURCE}
            className="inline-flex h-8 shrink-0 items-center rounded-design-control bg-design-primary px-3.5 text-[13px] font-semibold text-design-primary-foreground transition duration-design ease-design hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary"
          >
            Start session
          </button>
        </div>
      </div>
    </div>
  );
}
