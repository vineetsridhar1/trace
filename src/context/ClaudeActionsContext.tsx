import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export interface ClaudeActionsContextValue {
  pendingRunMessageId: string | null;
  pendingRunInitialPrompt: string;
  sendMessage: (text: string, attachmentIds?: string[], filePaths?: string[]) => Promise<boolean>;
  runPendingMessage: (planMode: boolean, prompt: string) => Promise<void>;
  stopClaude: () => Promise<void>;
  sendThreadMessage: (text: string, attachmentIds?: string[], filePaths?: string[]) => Promise<boolean>;
  sendPlanResponse: (text: string, claudePrompt?: string) => Promise<void>;
  mergeToMain: () => Promise<void>;
}

const ClaudeActionsContext = createContext<ClaudeActionsContextValue | null>(null);

export function ClaudeActionsProvider({
  value,
  children,
}: {
  value: ClaudeActionsContextValue;
  children: ReactNode;
}) {
  return (
    <ClaudeActionsContext.Provider value={value}>
      {children}
    </ClaudeActionsContext.Provider>
  );
}

export function useClaudeActions() {
  const context = useContext(ClaudeActionsContext);
  if (!context) {
    throw new Error('useClaudeActions must be used within ClaudeActionsProvider');
  }
  return context;
}
