import { createContext, useContext } from "react";

/**
 * Provides the current event scope key (e.g. "session:abc123") to child components.
 * This avoids threading the scope key through every intermediate component as a prop.
 */
export const EventScopeContext = createContext<string>("");

export function useEventScopeKey(): string {
  const key = useContext(EventScopeContext);
  if (import.meta.env.DEV && !key) {
    console.warn("useEventScopeKey() called outside of an EventScopeContext.Provider");
  }
  return key;
}
