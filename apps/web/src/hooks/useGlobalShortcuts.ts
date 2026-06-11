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

/** Registers app-wide keyboard shortcuts: command palette (⌘K) and help (?). */
export function useGlobalShortcuts() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        useCommandPaletteStore.getState().togglePalette();
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
}
