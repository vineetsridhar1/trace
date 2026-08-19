import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { SessionEntity } from "@trace/client-core";
import type { WorkspaceSurface } from "./SidebarPanel";
import type { SpatialNewChatInput } from "./SpatialNewTab";
import { sendOptimisticSessionMessage } from "./sendOptimisticSessionMessage";
import type { DraftWorkspaceTab } from "./useWorkspaceTabRequests";

interface WorkspaceNewTabActionsOptions {
  sessionGroupId: string;
  selectedSession: SessionEntity | null;
  terminalAllowed: boolean;
  setDraftTabs: Dispatch<SetStateAction<DraftWorkspaceTab[]>>;
  setForegroundTabId: (tabId: string | null) => void;
  openFilesSidebar: (sessionGroupId: string, view: "files" | "changes") => void;
  createTerminal: (
    session: { id: string; _optimistic?: boolean },
    terminalAllowed: boolean,
    options?: { replaceWorkspaceTabId?: string },
  ) => Promise<void>;
  startChat: (input: SpatialNewChatInput) => Promise<string | null>;
}

/**
 * Turning a blank workspace tab into a real surface. Files and changes live in
 * the sidebar rather than the canvas, terminals replace the blank tab once the
 * server confirms them, and a started chat consumes the tab outright.
 */
export function useWorkspaceNewTabActions({
  sessionGroupId,
  selectedSession,
  terminalAllowed,
  setDraftTabs,
  setForegroundTabId,
  openFilesSidebar,
  createTerminal,
  startChat,
}: WorkspaceNewTabActionsOptions) {
  const convertTab = useCallback(
    (tabId: string, surface: WorkspaceSurface) => {
      if (surface === "files" || surface === "changes") {
        openFilesSidebar(sessionGroupId, surface);
        return;
      }
      if (surface === "terminal") {
        if (!selectedSession || !terminalAllowed) return;
        void createTerminal(selectedSession, terminalAllowed, {
          replaceWorkspaceTabId: tabId,
        }).catch((error: unknown) => {
          toast.error("Failed to create terminal", {
            description: error instanceof Error ? error.message : undefined,
          });
        });
        return;
      }
      if (surface === "browser") setForegroundTabId(tabId);
      setDraftTabs((drafts) =>
        drafts.map((candidate) => (candidate.id === tabId ? { ...candidate, surface } : candidate)),
      );
    },
    [
      createTerminal,
      openFilesSidebar,
      selectedSession,
      sessionGroupId,
      setDraftTabs,
      setForegroundTabId,
      terminalAllowed,
    ],
  );

  const openApplicationInTab = useCallback(
    (tabId: string, url: string) => {
      setForegroundTabId(tabId);
      setDraftTabs((drafts) =>
        drafts.map((candidate) =>
          candidate.id === tabId
            ? { ...candidate, surface: "browser", initialUrl: url }
            : candidate,
        ),
      );
    },
    [setDraftTabs, setForegroundTabId],
  );

  const startChatInTab = useCallback(
    async (tabId: string, input: SpatialNewChatInput) => {
      const sessionId = await startChat(input);
      if (!sessionId) return false;
      await sendOptimisticSessionMessage({
        sessionId,
        text: input.prompt,
        imageKeys: input.attachmentKeys.length > 0 ? input.attachmentKeys : undefined,
        imagePreviewUrls: input.imagePreviewUrls.length > 0 ? input.imagePreviewUrls : undefined,
        interactionMode: input.interactionMode === "code" ? undefined : input.interactionMode,
      });
      setDraftTabs((drafts) => drafts.filter((candidate) => candidate.id !== tabId));
      return true;
    },
    [setDraftTabs, startChat],
  );

  return { convertTab, openApplicationInTab, startChatInTab };
}
