import { useEffect } from "react";
import { useUIStore } from "../../../stores/ui";
import { useCreateAiConversation } from "./useAiConversationMutations";

/**
 * Registers Cmd+Shift+N (Mac) / Ctrl+Shift+N (other) to create a new AI conversation.
 */
export function useNewConversationShortcut() {
  const createConversation = useCreateAiConversation();
  const setActiveAiConversationId = useUIStore((s) => s.setActiveAiConversationId);

  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const id = await createConversation({});
        if (id) {
          setActiveAiConversationId(id);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [createConversation, setActiveAiConversationId]);
}
