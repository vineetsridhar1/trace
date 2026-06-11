import { useEffect, useId } from "react";
import { useCommandRegistryStore, type RegisteredCommand } from "../stores/command-registry";

/**
 * Register commands while the calling component is mounted. They appear in the
 * command palette and their optional key chords become active. Pass a memoized
 * `commands` array (e.g. via useMemo) so the effect doesn't re-run every render.
 */
export function useRegisterCommands(commands: RegisteredCommand[]): void {
  const token = useId();
  useEffect(() => {
    useCommandRegistryStore.getState().setCommands(token, commands);
    return () => useCommandRegistryStore.getState().clearCommands(token);
  }, [token, commands]);
}
