import { createContext, useContext } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { ClaudeModel, EffortLevel } from '../types';

export type PlanResponseMode = 'clear-context' | 'keep-context' | 'revise';

export interface ClaudeActionsContextValue {
  repoPath: string;
  pendingRunMessageId: string | null;
  pendingRunInitialPrompt: string;
  selectedModel: ClaudeModel;
  selectedEffort: EffortLevel;
  setSelectedModel: Dispatch<SetStateAction<ClaudeModel>>;
  setSelectedEffort: Dispatch<SetStateAction<EffortLevel>>;
  sendMessage: (text: string, attachmentIds?: string[], filePaths?: string[]) => Promise<boolean>;
  runPendingMessage: (planMode: boolean, prompt: string) => Promise<void>;
  autoRunQueuedTicket: (messageId: string, runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => Promise<void>;
  stopClaude: () => Promise<void>;
  sendThreadMessage: (text: string, attachmentIds?: string[], filePaths?: string[]) => Promise<boolean>;
  sendPlanResponse: (text: string, mode: PlanResponseMode, planContent?: string, planFilePath?: string) => Promise<void>;
  mergeToMain: () => Promise<void>;
  clearPendingRun: () => void;
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
