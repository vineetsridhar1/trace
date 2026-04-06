import { useCallback, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { useUpdateAiConversation } from "../hooks/useAiConversationMutations";

interface ConversationSettingsProps {
  conversationId: string;
  currentSystemPrompt: string | null | undefined;
}

export function ConversationSettings({
  conversationId,
  currentSystemPrompt,
}: ConversationSettingsProps) {
  const updateConversation = useUpdateAiConversation();
  const [systemPrompt, setSystemPrompt] = useState(currentSystemPrompt ?? "");
  const [open, setOpen] = useState(false);

  // Sync external changes
  useEffect(() => {
    setSystemPrompt(currentSystemPrompt ?? "");
  }, [currentSystemPrompt]);

  const handleSave = useCallback(() => {
    const trimmed = systemPrompt.trim();
    updateConversation({
      conversationId,
      input: { systemPrompt: trimmed || null },
    });
    setOpen(false);
  }, [conversationId, systemPrompt, updateConversation]);

  const hasPrompt = !!currentSystemPrompt?.trim();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Settings className={`h-3.5 w-3.5 ${hasPrompt ? "text-foreground" : ""}`} />
      </PopoverTrigger>
      <PopoverContent className="w-80" sideOffset={8}>
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium text-foreground">System Prompt</h4>
            <p className="text-xs text-muted-foreground">
              Instructions that guide the AI's behavior in this conversation.
            </p>
          </div>
          <textarea
            className="min-h-[100px] w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g., You are a helpful coding assistant..."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
