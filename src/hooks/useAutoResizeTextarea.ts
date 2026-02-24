import { useCallback, useEffect, useRef } from 'react';

interface UseAutoResizeTextareaOptions {
  maxHeight?: number;
  observeResize?: boolean;
}

export function useAutoResizeTextarea(
  value: string,
  options?: UseAutoResizeTextareaOptions,
) {
  const { maxHeight = 300, observeResize = false } = options ?? {};
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const measure = useCallback(
    (el: HTMLTextAreaElement) => {
      el.style.height = 'auto';
      const border = el.offsetHeight - el.clientHeight;
      el.style.height = `${Math.min(el.scrollHeight + border, maxHeight)}px`;
    },
    [maxHeight],
  );

  useEffect(() => {
    const el = ref.current;
    if (el) measure(el);
  }, [value, measure]);

  useEffect(() => {
    if (!observeResize || typeof ResizeObserver === 'undefined') return;
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(() => measure(el));
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, observeResize]);

  return ref;
}
