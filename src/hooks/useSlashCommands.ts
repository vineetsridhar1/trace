import { useState, useMemo, useCallback, useEffect } from 'react';

export interface SlashCommand {
  name: string;
  displayName: string;
  description: string;
  source: 'custom' | 'built-in';
}

const COMMANDS: SlashCommand[] = [
  // Custom commands first
  { name: 'create-pr', displayName: '/create-pr', description: 'Create a GitHub pull request', source: 'custom' },
  { name: 'merge-to-main', displayName: '/merge-to-main', description: 'Merge worktree branch to main', source: 'custom' },
  { name: 'rebase-onto-main', displayName: '/rebase-onto-main', description: 'Rebase current branch onto latest main', source: 'custom' },
  // Built-in commands
  { name: 'clear', displayName: '/clear', description: 'Clear thread and start fresh', source: 'built-in' },
  { name: 'compact', displayName: '/compact', description: 'Compact conversation history', source: 'built-in' },
  { name: 'config', displayName: '/config', description: 'Open configuration', source: 'built-in' },
  { name: 'cost', displayName: '/cost', description: 'Show token usage and cost', source: 'built-in' },
  { name: 'init', displayName: '/init', description: 'Initialize project settings', source: 'built-in' },
  { name: 'memory', displayName: '/memory', description: 'Edit CLAUDE.md memory files', source: 'built-in' },
  { name: 'review', displayName: '/review', description: 'Review code changes', source: 'built-in' },
  { name: 'status', displayName: '/status', description: 'Show session status', source: 'built-in' },
];

export function useSlashCommands(inputValue: string, onInputChange: (value: string) => void) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const query = inputValue.startsWith('/') ? inputValue.slice(1).toLowerCase() : null;

  const filteredCommands = useMemo(() => {
    if (query === null) return [];
    return COMMANDS.filter(
      (cmd) => cmd.name.includes(query) || cmd.description.toLowerCase().includes(query),
    );
  }, [query]);

  const isOpen = query !== null && !dismissed && filteredCommands.length > 0;

  // Reset dismissed on input change, clamp selectedIndex
  useEffect(() => {
    setDismissed(false);
  }, [inputValue]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length, inputValue]);

  const selectCommand = useCallback(
    (cmd: SlashCommand) => {
      onInputChange(cmd.displayName + ' ');
    },
    [onInputChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return false;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredCommands.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectCommand(filteredCommands[selectedIndex]);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        return true;
      }
      return false;
    },
    [isOpen, filteredCommands, selectedIndex, selectCommand],
  );

  return { isOpen, filteredCommands, selectedIndex, handleKeyDown, selectCommand };
}
