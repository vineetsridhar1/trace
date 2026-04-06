import { useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { AVAILABLE_MODELS, getModelLabel } from "../constants";
import { useUpdateAiConversation } from "../hooks/useAiConversationMutations";

interface ModelPickerProps {
  conversationId: string;
  currentModelId: string | null | undefined;
}

export function ModelPicker({ conversationId, currentModelId }: ModelPickerProps) {
  const updateConversation = useUpdateAiConversation();

  const handleModelChange = useCallback(
    (value: string | null) => {
      const modelId = !value || value === "__default__" ? null : value;
      updateConversation({
        conversationId,
        input: { modelId },
      });
    },
    [conversationId, updateConversation],
  );

  return (
    <Select value={currentModelId ?? "__default__"} onValueChange={handleModelChange}>
      <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground">
        <SelectValue>{getModelLabel(currentModelId)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__default__">Default (Claude Sonnet 4.6)</SelectItem>
        {AVAILABLE_MODELS.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            {model.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
