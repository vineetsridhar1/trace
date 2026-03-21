import { createContext, useContext } from "react";

/**
 * Provides the current event scope key (e.g. "session:abc123") to child components.
 * This avoids threading the scope key through every intermediate component as a prop.
 */
export const EventScopeContext = createContext<string>("");

export function useEventScopeKey(): string {
  return useContext(EventScopeContext);
}
