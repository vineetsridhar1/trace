import { useEffect, useRef } from "react";
import type { SlashCommand } from "../hooks/useSlashCommands";

interface WebSlashCommandMenuProps {
  isOpen: boolean;
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
}

export function WebSlashCommandMenu({
  isOpen,
  commands,
  selectedIndex,
  onSelect,
}: WebSlashCommandMenuProps) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 max-h-56 overflow-y-auto rounded-lg border border-edge bg-surface-elevated py-1 shadow-lg">
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          ref={i === selectedIndex ? selectedRef : null}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(cmd);
          }}
          className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
            i === selectedIndex
              ? "bg-accent/20 text-primary"
              : "text-primary hover:bg-surface-elevated"
          }`}
        >
          <span className="font-medium text-accent-light">
            {cmd.displayName}
          </span>
          <span className="flex-1 truncate text-muted">{cmd.description}</span>
          {cmd.source === "project" && (
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-light">
              project
            </span>
          )}
          {cmd.source === "global" && (
            <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
              global
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
