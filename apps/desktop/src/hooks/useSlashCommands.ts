import { useState, useMemo, useCallback, useEffect } from "react";

export interface SlashCommand {
  name: string;
  displayName: string;
  description: string;
  source: "global" | "project" | "built-in";
}

const BUILT_IN_COMMANDS: SlashCommand[] = [
  {
    name: "clear",
    displayName: "/clear",
    description: "Clear thread and start fresh",
    source: "built-in",
  },
  {
    name: "compact",
    displayName: "/compact",
    description: "Compact conversation history",
    source: "built-in",
  },
  {
    name: "config",
    displayName: "/config",
    description: "Open configuration",
    source: "built-in",
  },
  {
    name: "cost",
    displayName: "/cost",
    description: "Show token usage and cost",
    source: "built-in",
  },
  {
    name: "doctor",
    displayName: "/doctor",
    description: "Check health of Claude Code installation",
    source: "built-in",
  },
  {
    name: "init",
    displayName: "/init",
    description: "Initialize project settings",
    source: "built-in",
  },
  {
    name: "memory",
    displayName: "/memory",
    description: "Edit CLAUDE.md memory files",
    source: "built-in",
  },
  {
    name: "model",
    displayName: "/model",
    description: "Switch the AI model",
    source: "built-in",
  },
  {
    name: "permissions",
    displayName: "/permissions",
    description: "View and manage tool permissions",
    source: "built-in",
  },
  {
    name: "pr-comments",
    displayName: "/pr-comments",
    description: "View and address PR review comments",
    source: "built-in",
  },
  {
    name: "review",
    displayName: "/review",
    description: "Review code changes",
    source: "built-in",
  },
  {
    name: "status",
    displayName: "/status",
    description: "Show session status",
    source: "built-in",
  },
  {
    name: "terminal-setup",
    displayName: "/terminal-setup",
    description: "Configure terminal integration",
    source: "built-in",
  },
  {
    name: "vim",
    displayName: "/vim",
    description: "Toggle vim keybindings mode",
    source: "built-in",
  },
];

// Module-level cache so both WorkspaceInput and ThreadInput share the same results
const CACHE_TTL_MS = 30_000;
const commandCache = new Map<
  string,
  { commands: SlashCommand[]; ts: number }
>();
const fetchPromises = new Map<string, Promise<SlashCommand[]>>();

function getProjectCommands(repoPath: string): Promise<SlashCommand[]> {
  const cached = commandCache.get(repoPath);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS)
    return Promise.resolve(cached.commands);

  let promise = fetchPromises.get(repoPath);
  if (!promise) {
    promise = window.traceAPI
      .listSlashCommands(repoPath)
      .then((result) => {
        fetchPromises.delete(repoPath);
        const commands: SlashCommand[] = result.success
          ? result.commands.map((cmd) => ({
              name: cmd.name,
              displayName: `/${cmd.name}`,
              description: cmd.description || `Run ${cmd.name} command`,
              source: cmd.source,
            }))
          : [];
        commandCache.set(repoPath, { commands, ts: Date.now() });
        return commands;
      })
      .catch((err) => {
        fetchPromises.delete(repoPath);
        commandCache.delete(repoPath);
        console.error("Failed to fetch slash commands:", err);
        return [] as SlashCommand[];
      });
    fetchPromises.set(repoPath, promise);
  }
  return promise;
}

export function useSlashCommands(
  inputValue: string,
  onInputChange: (value: string) => void,
  repoPath?: string,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [projectCommands, setProjectCommands] = useState<SlashCommand[]>([]);

  useEffect(() => {
    let stale = false;
    getProjectCommands(repoPath ?? "").then((cmds) => {
      if (!stale) setProjectCommands(cmds);
    });
    return () => {
      stale = true;
    };
  }, [repoPath]);

  const allCommands = useMemo(() => {
    const byName = new Map<string, SlashCommand>();
    for (const cmd of BUILT_IN_COMMANDS) byName.set(cmd.name, cmd);
    for (const cmd of projectCommands) byName.set(cmd.name, cmd);
    return Array.from(byName.values());
  }, [projectCommands]);

  const query = inputValue.startsWith("/")
    ? inputValue.slice(1).toLowerCase()
    : null;

  const filteredCommands = useMemo(() => {
    if (query === null) return [];
    return allCommands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query),
    );
  }, [query, allCommands]);

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
      onInputChange(cmd.displayName + " ");
    },
    [onInputChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredCommands.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (i) => (i - 1 + filteredCommands.length) % filteredCommands.length,
        );
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectCommand(filteredCommands[selectedIndex]);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return true;
      }
      return false;
    },
    [isOpen, filteredCommands, selectedIndex, selectCommand],
  );

  return {
    isOpen,
    filteredCommands,
    selectedIndex,
    handleKeyDown,
    selectCommand,
  };
}
