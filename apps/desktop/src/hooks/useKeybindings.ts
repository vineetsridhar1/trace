import { useEffect, useRef } from 'react';

export interface KeyBinding {
  keys: string;
  callback: () => void;
  ignoreTextInputs?: boolean;
}

interface StackEntry {
  id: number;
  bindings: KeyBinding[];
}

let nextId = 0;

class KeybindingStackManager {
  private entries: StackEntry[] = [];

  push(bindings: KeyBinding[]): number {
    const id = nextId++;
    this.entries.push({ id, bindings });
    return id;
  }

  remove(id: number): void {
    this.entries = this.entries.filter((e) => e.id !== id);
  }

  resolve(keyCombo: string, isTextInput: boolean): (() => void) | null {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      for (const binding of this.entries[i].bindings) {
        if (binding.keys === keyCombo) {
          if (isTextInput && binding.ignoreTextInputs) continue;
          return binding.callback;
        }
      }
    }
    return null;
  }
}

export const keybindingManager = new KeybindingStackManager();

export function useKeybindings(bindings: KeyBinding[]): void {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    const id = keybindingManager.push(bindingsRef.current);
    return () => keybindingManager.remove(id);
    // Re-register when bindings array identity changes
  }, [bindings]);
}
