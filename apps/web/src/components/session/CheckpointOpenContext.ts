import { createContext, useContext } from "react";

/**
 * Provides a callback to open the checkpoint panel and optionally
 * highlight a specific checkpoint. Mirrors the FileOpenContext pattern.
 */
export const CheckpointOpenContext = createContext<
  ((checkpointId?: string) => void) | null
>(null);

export function useCheckpointOpen(): ((checkpointId?: string) => void) | null {
  return useContext(CheckpointOpenContext);
}
