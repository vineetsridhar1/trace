import { useCallback, useRef, useState } from 'react';
import type { Workspace } from '../types';

export function useThreadSelection() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const selectedWorkspaceRef = useRef<Workspace | null>(null);
  const selectedWorkspaceIdRef = useRef<string | null>(null);

  selectedWorkspaceRef.current = selectedWorkspace;
  selectedWorkspaceIdRef.current = selectedWorkspaceId;

  const syncSelectedWorkspace = useCallback((workspace: Workspace) => {
    setSelectedWorkspace((current) => {
      if (current && current.id === workspace.id) return workspace;
      return current;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedWorkspaceId(null);
    setSelectedWorkspace(null);
  }, []);

  const selectWorkspace = useCallback((workspace: Workspace) => {
    setSelectedWorkspaceId(workspace.id);
    setSelectedWorkspace(workspace);
  }, []);

  return {
    selectedWorkspaceId,
    selectedWorkspace,
    selectedWorkspaceRef,
    selectedWorkspaceIdRef,
    syncSelectedWorkspace,
    clearSelection,
    selectWorkspace,
  };
}
