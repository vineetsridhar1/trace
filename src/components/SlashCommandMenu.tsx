import { useEffect, useRef } from 'react';
import type { SlashCommand } from '../hooks/useSlashCommands';

interface SlashCommandMenuProps {
  isOpen: boolean;
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
}

export function SlashCommandMenu({ isOpen, commands, selectedIndex, onSelect }: SlashCommandMenuProps) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 max-h-56 overflow-y-auto rounded-lg border border-[#292e42] bg-[#1f2335] py-1 shadow-lg">
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
            i === selectedIndex ? 'bg-violet-500/20 text-[#c0caf5]' : 'text-[#a9b1d6] hover:bg-[#292e42]'
          }`}
        >
          <span className="font-medium text-violet-300">{cmd.displayName}</span>
          <span className="flex-1 truncate text-[#565f89]">{cmd.description}</span>
          {cmd.source === 'custom' && (
            <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
              project
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
