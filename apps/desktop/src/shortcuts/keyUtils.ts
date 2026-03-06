export const isMac = navigator.platform.toUpperCase().includes('MAC');

/** Convert a KeyboardEvent into a normalized key string like 'mod+shift+t'. */
export function normalizeKeyEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  let key = e.key.toLowerCase();
  // Normalize special keys
  if (key === 'escape') key = 'escape';
  else if (key === ' ') key = 'space';
  else if (key === 'arrowup') key = 'up';
  else if (key === 'arrowdown') key = 'down';
  else if (key === 'arrowleft') key = 'left';
  else if (key === 'arrowright') key = 'right';
  // For bracket keys, use the event.code to get consistent values
  else if (e.code === 'BracketLeft') key = '[';
  else if (e.code === 'BracketRight') key = ']';

  // Don't add modifier keys themselves as the key
  if (['meta', 'control', 'shift', 'alt'].includes(key)) return '';

  parts.push(key);
  return parts.join('+');
}

const MAC_SYMBOLS: Record<string, string> = {
  mod: '⌘',
  shift: '⇧',
  alt: '⌥',
  escape: 'Esc',
  space: 'Space',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

const PC_SYMBOLS: Record<string, string> = {
  mod: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  escape: 'Esc',
  space: 'Space',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

/** Convert a normalized key string into a display-friendly format. */
export function formatKeyCombo(keys: string): string[] {
  const symbols = isMac ? MAC_SYMBOLS : PC_SYMBOLS;
  return keys.split('+').map((part) => symbols[part] ?? part.toUpperCase());
}

/** Check if a keyboard event has any modifier key pressed. */
export function hasModifierKey(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey || e.altKey;
}
