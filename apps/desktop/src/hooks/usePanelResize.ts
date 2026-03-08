import { useEffect } from 'react';
import { clamp } from '../utils';
import { useAppUIStore } from '../stores/appUIStore';
import { useThreadStore } from '../stores/threadStore';

const SERVER_RAIL_WIDTH = 60;
const MIN_WORKSPACE_SIDEBAR_WIDTH = 180;
const MAX_WORKSPACE_SIDEBAR_WIDTH = 500;

function getWorkspaceSidebarWidthFromPointer(
  clientX: number,
  dockSide: 'left' | 'right',
): number {
  const sidebar = document.getElementById('workspace-sidebar');
  if (!sidebar) {
    return dockSide === 'left'
      ? MIN_WORKSPACE_SIDEBAR_WIDTH
      : MAX_WORKSPACE_SIDEBAR_WIDTH;
  }

  const rect = sidebar.getBoundingClientRect();
  const rawWidth =
    dockSide === 'left' ? clientX - rect.left : rect.right - clientX;

  return clamp(rawWidth, MIN_WORKSPACE_SIDEBAR_WIDTH, MAX_WORKSPACE_SIDEBAR_WIDTH);
}

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
        const newWidth = getWorkspaceSidebarWidthFromPointer(
          event.clientX,
          useAppUIStore.getState().workspaceSidebarDockSide,
        );
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
        const finalWidth = getWorkspaceSidebarWidthFromPointer(
          event.clientX,
          useAppUIStore.getState().workspaceSidebarDockSide,
        );
        useAppUIStore.getState().setWorkspaceSidebarWidth(finalWidth);
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
