import { useEffect } from 'react';
import { clamp } from '../utils';
import { useAppUIStore } from '../stores/appUIStore';
import { useThreadStore } from '../stores/threadStore';

const SERVER_RAIL_WIDTH = 60;

export function usePanelResize() {
  const dragging = useAppUIStore((s) => s.dragging);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (event: MouseEvent) => {
      if (dragging === 'left') {
        useAppUIStore.getState().setChannelWidth(clamp(event.clientX - SERVER_RAIL_WIDTH, 160, 400));
        return;
      }
      if (dragging === 'workspace-sidebar') {
        const newWidth = clamp(window.innerWidth - event.clientX, 200, 500);
        useAppUIStore.getState().setWorkspaceSidebarWidth(newWidth);
        return;
      }
      useThreadStore.getState().setThreadWidth(Math.max(window.innerWidth - event.clientX, 280));
    };

    const onMouseUp = (event: MouseEvent) => {
      if (dragging === 'right') {
        const finalWidth = window.innerWidth - event.clientX;
        localStorage.setItem('trace:threadWidth', String(finalWidth));
      }
      if (dragging === 'workspace-sidebar') {
        const finalWidth = clamp(window.innerWidth - event.clientX, 200, 500);
        localStorage.setItem('trace:workspaceSidebarWidth', String(finalWidth));
      }
      useAppUIStore.getState().setDragging(null);
    };

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
  }, [dragging]);
}
