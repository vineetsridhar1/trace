import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent, RefCallback } from "react";

interface ListboxNav {
  containerProps: {
    role: "listbox";
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  };
  registerItem: (index: number) => RefCallback<HTMLButtonElement>;
}

export function useListboxNav(itemCount: number, autoFocusIndex = 0): ListboxNav {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    itemRefs.current.length = itemCount;
  }, [itemCount]);

  useEffect(() => {
    if (itemCount === 0) return;
    const frame = requestAnimationFrame(() => {
      const target = itemRefs.current[Math.max(0, Math.min(autoFocusIndex, itemCount - 1))];
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocusIndex, itemCount]);

  const focusAt = useCallback(
    (index: number) => {
      if (itemCount === 0) return;
      const wrapped = ((index % itemCount) + itemCount) % itemCount;
      itemRefs.current[wrapped]?.focus();
    },
    [itemCount],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (itemCount === 0) return;
      const active = document.activeElement as HTMLButtonElement | null;
      const currentIndex = itemRefs.current.findIndex((el) => el === active);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusAt(currentIndex < 0 ? 0 : currentIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusAt(currentIndex < 0 ? itemCount - 1 : currentIndex - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusAt(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusAt(itemCount - 1);
      }
    },
    [focusAt, itemCount],
  );

  const registerItem = useCallback(
    (index: number): RefCallback<HTMLButtonElement> =>
      (el) => {
        itemRefs.current[index] = el;
      },
    [],
  );

  return {
    containerProps: { role: "listbox", onKeyDown },
    registerItem,
  };
}
