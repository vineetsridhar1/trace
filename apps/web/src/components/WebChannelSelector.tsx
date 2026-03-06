import { useCallback, useRef, useState } from 'react';
import { FiChevronDown, FiHash } from 'react-icons/fi';
import { useChannelContext } from '../context/ChannelContext';

export function WebChannelSelector() {
  const { channels, activeChannel, switchChannel } = useChannelContext();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (id: string) => {
      switchChannel(id);
      setOpen(false);
    },
    [switchChannel],
  );

  if (channels.length <= 1) return null;

  return (
    <div ref={containerRef} className="relative border-b border-edge">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget)) {
            setOpen(false);
          }
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-elevated"
      >
        <FiHash className="h-3.5 w-3.5 shrink-0 text-muted" />
        <span className="truncate">{activeChannel?.name ?? 'Select channel'}</span>
        <FiChevronDown
          className={`ml-auto h-3.5 w-3.5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 max-h-60 overflow-y-auto border-b border-edge bg-surface shadow-lg">
          {channels.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(ch.id)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                ch.id === activeChannel?.id
                  ? 'bg-accent/20 text-primary'
                  : 'text-muted hover:bg-surface-elevated hover:text-primary'
              }`}
            >
              <FiHash className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{ch.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
