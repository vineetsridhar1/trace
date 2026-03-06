import { useEffect, useRef } from 'react';
import { useShortcutStore } from '../stores/shortcutStore';
import type { ShortcutCategory, ShortcutContext } from '../stores/shortcutStore';

interface UseHotkeyOptions {
  label: string;
  category: ShortcutCategory;
  context: ShortcutContext;
  preventDefault?: boolean;
}

export function useHotkey(
  id: string,
  keys: string,
  action: () => void,
  options: UseHotkeyOptions,
): void {
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    const store = useShortcutStore.getState();
    store.register({
      id,
      keys,
      label: options.label,
      category: options.category,
      context: options.context,
      preventDefault: options.preventDefault,
      action: () => actionRef.current(),
    });
    return () => useShortcutStore.getState().unregister(id);
    // Only re-register if the identity/keys change, not the action closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, keys]);
}
