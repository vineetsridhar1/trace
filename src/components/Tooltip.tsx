import { useRef, useState, useLayoutEffect } from 'react';

const GAP = 8;

export function Tooltip({ text, children, position = 'top' }: {
  text: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
}) {
  const [hovered, setHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!hovered) return;
    const trigger = triggerRef.current;
    const tip = tipRef.current;
    if (!trigger || !tip) return;

    const tr = trigger.getBoundingClientRect();
    const tt = tip.getBoundingClientRect();
    const top = position === 'top' ? tr.top - tt.height - GAP : tr.bottom + GAP;
    let left = tr.left + tr.width / 2 - tt.width / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - tt.width - 4));

    setCoords({ top, left });
  }, [hovered, position]);

  if (!text) return <>{children}</>;

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setCoords(null); }}
    >
      {children}
      {hovered && (
        <div
          ref={tipRef}
          role="tooltip"
          className="pointer-events-none fixed z-[9999] whitespace-nowrap rounded-md border border-[#292e42] bg-[#1f2335] px-2 py-1 text-[11px] text-[#c0caf5] shadow-lg"
          style={coords
            ? { top: coords.top, left: coords.left }
            : { top: 0, left: -9999 }
          }
        >
          {text}
        </div>
      )}
    </div>
  );
}
