import { useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip";
import { useUIStore } from "../../../stores/ui";
import { useCreateAiConversation } from "../hooks/useAiConversationMutations";

export function NewConversationButton() {
  const createConversation = useCreateAiConversation();
  const setActiveAiConversationId = useUIStore((s) => s.setActiveAiConversationId);

  const handleCreate = useCallback(async () => {
    const id = await createConversation({});
    if (id) {
      setActiveAiConversationId(id);
    }
  }, [createConversation, setActiveAiConversationId]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleCreate}
          />
        }
      >
        <Plus className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent>New conversation</TooltipContent>
    </Tooltip>
  );
}
