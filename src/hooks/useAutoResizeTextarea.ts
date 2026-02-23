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
      const nextValue = valueRef.current;
      if (!nextValue) {
        el.style.height = '';
        return;
      }
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
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
