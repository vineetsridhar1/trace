import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

const TRIGGER_SIZE = 36;
const TRIGGER_TOP_OFFSET = 12;
const BLOCK_TOP_INSET = 6;
const VIEWPORT_SIDE_INSET = 18;
export const STEERABLE_PREVIEW_WIDTH = 288;
const PREVIEW_GAP = 14;

export interface SteerableBlockPosition {
  top: number;
  left: number;
  previewLeft: number;
}

function getScrollContainer(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;

  while (parent) {
    const { overflowY } = window.getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return parent;
    }
    parent = parent.parentElement;
  }

  return null;
}

function calculatePosition(element: HTMLElement): SteerableBlockPosition | null {
  const blockRect = element.getBoundingClientRect();
  const scrollContainer = getScrollContainer(element);
  const scrollRect = scrollContainer?.getBoundingClientRect();
  const containerTop = scrollRect?.top ?? 0;
  const visibleTop = containerTop + TRIGGER_TOP_OFFSET;
  const visibleBottom = scrollRect?.bottom ?? window.innerHeight;

  if (blockRect.bottom <= containerTop || blockRect.top >= visibleBottom) {
    return null;
  }

  const blockTop = blockRect.top + BLOCK_TOP_INSET;
  const blockBottom = blockRect.bottom - TRIGGER_SIZE - BLOCK_TOP_INSET;
  const top = Math.min(Math.max(blockTop, visibleTop), blockBottom);
  const left = Math.min(
    Math.max(blockRect.right, VIEWPORT_SIDE_INSET),
    window.innerWidth - VIEWPORT_SIDE_INSET,
  );
  const previewLeftOnRight = left + TRIGGER_SIZE / 2 + PREVIEW_GAP;
  const previewRightEdge = previewLeftOnRight + STEERABLE_PREVIEW_WIDTH;
  const previewLeft = Math.max(
    VIEWPORT_SIDE_INSET,
    previewRightEdge <= window.innerWidth - VIEWPORT_SIDE_INSET
      ? previewLeftOnRight
      : left - TRIGGER_SIZE / 2 - PREVIEW_GAP - STEERABLE_PREVIEW_WIDTH,
  );

  return { top, left, previewLeft };
}

function positionsEqual(
  current: SteerableBlockPosition | null,
  next: SteerableBlockPosition | null,
): boolean {
  return (
    current?.top === next?.top &&
    current?.left === next?.left &&
    current?.previewLeft === next?.previewLeft
  );
}

export function useSteerableBlockPosition(
  blockRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): SteerableBlockPosition | null {
  const [position, setPosition] = useState<SteerableBlockPosition | null>(null);

  const updatePosition = useCallback(() => {
    const element = blockRef.current;
    if (!element) return;
    const nextPosition = calculatePosition(element);
    setPosition((current) => (positionsEqual(current, nextPosition) ? current : nextPosition));
  }, [blockRef]);

  useLayoutEffect(() => {
    if (!enabled) {
      setPosition(null);
      return;
    }

    let frameId: number | null = null;
    const scheduleUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updatePosition();
      });
    };

    updatePosition();
    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [enabled, updatePosition]);

  return position;
}
