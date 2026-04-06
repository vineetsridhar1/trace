import { SidebarTrigger } from "../../../components/ui/sidebar";
import { useEntityStore, type AiConversationEntity } from "../../../stores/entity";
import { ModelPicker } from "./ModelPicker";
import { ConversationSettings } from "./ConversationSettings";

interface AiConversationViewProps {
  conversationId: string;
}

export function AiConversationView({ conversationId }: AiConversationViewProps) {
  const conversation = useEntityStore(
    (s) => s.aiConversations[conversationId],
  ) as AiConversationEntity | undefined;

  if (!conversation) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
        </header>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Conversation not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <h1 className="truncate text-sm font-medium text-foreground">
          {conversation.title ?? "New Conversation"}
        </h1>
        <div className="ml-auto flex items-center gap-1">
          <ModelPicker
            conversationId={conversationId}
            currentModelId={conversation.modelId}
          />
          <ConversationSettings
            conversationId={conversationId}
            currentSystemPrompt={conversation.systemPrompt}
          />
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Conversation view - send a message to get started
        </p>
      </div>
    </div>
  );
}
