import { formatKeyCombo } from '../shortcuts/keyUtils';

interface KbdProps {
  keys: string;
}

export function Kbd({ keys }: KbdProps) {
  const parts = formatKeyCombo(keys);
  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((part, i) => (
        <kbd
          key={i}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-edge bg-surface-deep px-1 text-[11px] font-medium text-muted"
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}
