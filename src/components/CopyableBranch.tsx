import { useState, useCallback, useRef, useEffect } from 'react';

export function CopyableBranch({ branch }: { branch: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const displayName = branch.replace(/^trace\//, '');

  const stopEvent = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(branch);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [branch]);

  if (copied) {
    return (
      <span className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-green-400">
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        Copied
      </span>
    );
  }

  return (
    <span
      className="group/branch relative min-w-0 cursor-copy"
      onClick={handleClick}
      onMouseDown={stopEvent}
    >
      <span className="block truncate rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-accent-light">
        {displayName}
      </span>
      <span className="pointer-events-none invisible absolute left-0 top-0 z-10 whitespace-nowrap rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-accent-light shadow-lg group-hover/branch:visible">
        {displayName}
      </span>
    </span>
  );
}
