import { create } from "zustand";

export interface CommandShortcut {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface RegisteredCommand {
  id: string;
  title: string;
  group: string;
  keywords?: string;
  run: () => void;
  shortcut?: CommandShortcut;
}

interface CommandRegistryState {
  /** Commands keyed by the registering component's token, so unmount can clear them. */
  commandsByToken: Record<string, RegisteredCommand[]>;
  setCommands: (token: string, commands: RegisteredCommand[]) => void;
  clearCommands: (token: string) => void;
}

export const useCommandRegistryStore = create<CommandRegistryState>((set) => ({
  commandsByToken: {},
  setCommands: (token, commands) =>
    set((s) => ({ commandsByToken: { ...s.commandsByToken, [token]: commands } })),
  clearCommands: (token) =>
    set((s) => {
      if (!(token in s.commandsByToken)) return {};
      const { [token]: _removed, ...rest } = s.commandsByToken;
      return { commandsByToken: rest };
    }),
}));

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /Mac|iPhone|iPad/.test(platform);
}

export function formatShortcut(shortcut: CommandShortcut): string[] {
  const isMac = isMacPlatform();
  const keys: string[] = [];
  if (shortcut.mod) keys.push(isMac ? "⌘" : "Ctrl");
  if (shortcut.shift) keys.push("⇧");
  if (shortcut.alt) keys.push(isMac ? "⌥" : "Alt");
  keys.push(formatKey(shortcut.key));
  return keys;
}

function formatKey(key: string): string {
  if (key === "Enter") return "⏎";
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

export function matchesShortcut(event: KeyboardEvent, shortcut: CommandShortcut): boolean {
  // `mod` matches the platform command key on either OS: Cmd on macOS, Ctrl
  // elsewhere. We accept both so chords work cross-platform without per-OS defs.
  const mod = event.metaKey || event.ctrlKey;
  if (!!shortcut.mod !== mod) return false;
  if (!!shortcut.shift !== event.shiftKey) return false;
  if (!!shortcut.alt !== event.altKey) return false;
  return event.key.toLowerCase() === shortcut.key.toLowerCase();
}
