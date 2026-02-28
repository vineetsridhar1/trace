import { useCallback, useEffect, useState } from 'react';
import type { DragTarget } from '../types';
import { clamp } from '../utils';

export function usePanelResize(
  setChannelWidth: (w: number) => void,
  setThreadWidth: (w: number) => void,
  leftOffset: number = 0,
) {
  const [dragging, setDragging] = useState<DragTarget>(null);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (event: MouseEvent) => {
      if (dragging === 'left') {
        setChannelWidth(clamp(event.clientX - leftOffset, 160, 400));
        return;
      }
      setThreadWidth(Math.max(window.innerWidth - event.clientX, 280));
    };

    const onMouseUp = () => setDragging(null);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, setChannelWidth, setThreadWidth, leftOffset]);

  const startDragging = useCallback((target: DragTarget) => setDragging(target), []);

  return { dragging, startDragging };
}
