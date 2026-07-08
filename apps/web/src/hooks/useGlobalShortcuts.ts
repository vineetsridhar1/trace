import { useEffect } from "react";
import { useCommandPaletteStore } from "../stores/command-palette";
import { matchesShortcut, useCommandRegistryStore } from "../stores/command-registry";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/** Registers app-wide keyboard shortcuts: command palette (⌘K / ⌘F) and help (?). */
export function useGlobalShortcuts() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        useCommandPaletteStore.getState().togglePalette();
        return;
      }
      // ⌘F opens the palette in search mode, seeded with the current selection so
      // "select text → ⌘F" searches it (overriding the browser's find-in-page).
      if ((event.metaKey || event.ctrlKey) && key === "f") {
        event.preventDefault();
        const selection = window.getSelection()?.toString().trim() ?? "";
        useCommandPaletteStore.getState().openForSearch(selection);
        return;
      }

      if (
        event.key === "?" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        useCommandPaletteStore.getState().setShortcutsOpen(true);
        return;
      }

      // Chords contributed by mounted components via the command registry.
      const editable = isEditableTarget(event.target);
      for (const commands of Object.values(
        useCommandRegistryStore.getState().commandsByToken,
      )) {
        for (const command of commands) {
          if (!command.shortcut) continue;
          // Plain (modifier-less) chords are suppressed while typing.
          if (!command.shortcut.mod && editable) continue;
          if (matchesShortcut(event, command.shortcut)) {
            event.preventDefault();
            command.run();
            return;
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // In the desktop shell, ⌘W is owned by the app menu (it would close the
  // window), so the menu forwards it here as an IPC command instead.
  useEffect(() => {
    const trace = window.trace;
    if (!trace?.onMenuCommand) return;
    return trace.onMenuCommand((command) => {
      if (command !== "close-tab") return;
      const commands = Object.values(
        useCommandRegistryStore.getState().commandsByToken,
      ).flat();
      const closeTab = commands.find((c) => c.id === "session.close-tab");
      if (closeTab) {
        closeTab.run();
      } else {
        // No in-app tab to close (e.g. the sessions table) — close the window.
        trace.send("close-window", null);
      }
    });
  }, []);
}
