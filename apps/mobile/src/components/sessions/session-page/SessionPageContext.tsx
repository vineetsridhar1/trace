import { createContext, useContext, type ReactNode } from "react";

interface SessionPageContextValue {
  overlayHeight: number;
  resolvedBrowserUrl: string | null;
  sessionId: string;
  onBrowserUrlChange: (nextUrl: string) => void;
  onSelectSession: (nextId: string) => void;
}

const SessionPageContext = createContext<SessionPageContextValue | null>(null);

interface SessionPageProviderProps {
  children: ReactNode;
  value: SessionPageContextValue;
}

export function SessionPageProvider({ children, value }: SessionPageProviderProps) {
  return (
    <SessionPageContext.Provider value={value}>
      {children}
    </SessionPageContext.Provider>
  );
}

export function useSessionPageContext(): SessionPageContextValue {
  const value = useContext(SessionPageContext);
  if (!value) {
    throw new Error("useSessionPageContext must be used inside SessionPageProvider");
  }
  return value;
}
