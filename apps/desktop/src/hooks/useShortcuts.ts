import { useEffect } from 'react';
import { useShortcutStore, CONTEXT_PRIORITY } from '../stores/shortcutStore';
import type { ShortcutDefinition } from '../stores/shortcutStore';
import { normalizeKeyEvent, hasModifierKey } from '../shortcuts/keyUtils';
import { keybindingManager } from './useKeybindings';

/** Should we suppress this shortcut while the user is typing? */
function shouldSuppress(e: KeyboardEvent): { suppress: boolean; isTextInput: boolean } {
  const target = e.target as HTMLElement | null;
  if (!target) return { suppress: false, isTextInput: false };

  const tag = target.tagName;
  const isTextInput = tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  const isXterm = target.classList?.contains('xterm-helper-textarea') ?? false;

  // In text inputs, let native editing shortcuts (Cmd/Alt+Backspace/Delete) through
  if (isTextInput && (e.key === 'Backspace' || e.key === 'Delete'))
    return { suppress: true, isTextInput };

  // Allow other modifier combos through
  if (hasModifierKey(e)) return { suppress: false, isTextInput: isTextInput || isXterm };

  // Escape in any text input blurs it
  if (e.key === 'Escape' && (isTextInput || isXterm)) {
    (target as HTMLElement).blur();
    return { suppress: true, isTextInput: true };
  }

  // Suppress plain keys when focused in text inputs or xterm
  if (isTextInput || isXterm) return { suppress: true, isTextInput: true };

  return { suppress: false, isTextInput: false };
}

/**
 * Single global keydown listener. Call once in AppContent.
 * Dispatches to the highest-priority matching shortcut based on active contexts.
 */
export function useShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Respect component-level handlers that already consumed the event
      if (e.defaultPrevented) return;

      const keyCombo = normalizeKeyEvent(e);
      if (!keyCombo) return;

      const { suppress, isTextInput } = shouldSuppress(e);

      // Check the keybinding stack first (component-level overrides)
      const stackCallback = keybindingManager.resolve(keyCombo, isTextInput);
      if (stackCallback) {
        e.preventDefault();
        stackCallback();
        return;
      }

      if (suppress) return;

      const { shortcuts, activeContexts } = useShortcutStore.getState();

      // Find all matching shortcuts for this key combo
      const matches: ShortcutDefinition[] = [];
      for (const shortcut of shortcuts.values()) {
        if (shortcut.keys === keyCombo && activeContexts.has(shortcut.context)) {
          matches.push(shortcut);
        }
      }

      if (matches.length === 0) return;

      // Pick the highest-priority context match
      let best = matches[0];
      let bestPriority = CONTEXT_PRIORITY.indexOf(best.context);
      for (let i = 1; i < matches.length; i++) {
        const p = CONTEXT_PRIORITY.indexOf(matches[i].context);
        if (p > bestPriority) {
          best = matches[i];
          bestPriority = p;
        }
      }

      if (best.preventDefault !== false) e.preventDefault();
      best.action();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
