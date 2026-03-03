import { createPortal } from 'react-dom';
import { FiX } from 'react-icons/fi';
import { useShortcutStore } from '../stores/shortcutStore';
import type { ShortcutCategory, ShortcutDefinition } from '../stores/shortcutStore';
import { Kbd } from './Kbd';

const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  navigation: 'Navigation',
  panels: 'Panels',
  terminal: 'Terminal',
  thread: 'Thread',
  creation: 'Creation',
  general: 'General',
};

const CATEGORY_ORDER: ShortcutCategory[] = ['navigation', 'panels', 'terminal', 'thread', 'creation', 'general'];

export function ShortcutHelpDialog() {
  const open = useShortcutStore((s) => s.helpDialogOpen);
  const shortcuts = useShortcutStore((s) => s.shortcuts);

  if (!open) return null;

  const close = () => useShortcutStore.getState().setHelpDialogOpen(false);

  // Group shortcuts by category
  const grouped = new Map<ShortcutCategory, ShortcutDefinition[]>();
  for (const shortcut of shortcuts.values()) {
    const list = grouped.get(shortcut.category) ?? [];
    list.push(shortcut);
    grouped.set(shortcut.category, list);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="w-[520px] max-h-[80vh] overflow-y-auto rounded-lg border border-edge bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="text-sm font-semibold text-primary">Keyboard Shortcuts</h2>
          <button
            className="text-muted hover:text-primary"
            onClick={close}
          >
            <FiX className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {CATEGORY_ORDER.map((category) => {
            const items = grouped.get(category);
            if (!items || items.length === 0) return null;
            return (
              <div key={category}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  {CATEGORY_LABELS[category]}
                </h3>
                <div className="space-y-1">
                  {items.map((shortcut) => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-surface-elevated"
                    >
                      <span className="text-primary">{shortcut.label}</span>
                      <Kbd keys={shortcut.keys} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
