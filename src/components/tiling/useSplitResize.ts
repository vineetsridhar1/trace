import { useEffect, useRef, useCallback } from 'react';
import { usePanelLayoutStore } from '../../stores/panelLayoutStore';

interface SplitResizeState {
  splitId: string;
  direction: 'horizontal' | 'vertical';
  containerRect: DOMRect;
}

export function useSplitResize() {
  const activeRef = useRef<SplitResizeState | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent, splitId: string, direction: 'horizontal' | 'vertical', containerEl: HTMLElement) => {
      e.preventDefault();
      e.stopPropagation();
      activeRef.current = {
        splitId,
        direction,
        containerRect: containerEl.getBoundingClientRect(),
      };
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const state = activeRef.current;
      if (!state) return;

      const { direction, containerRect } = state;
      let ratio: number;
      if (direction === 'horizontal') {
        ratio = (e.clientX - containerRect.left) / containerRect.width;
      } else {
        ratio = (e.clientY - containerRect.top) / containerRect.height;
      }
      usePanelLayoutStore.getState().setSplitRatio(state.splitId, ratio);
    };

    const onMouseUp = () => {
      if (!activeRef.current) return;
      activeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return { onMouseDown };
}
