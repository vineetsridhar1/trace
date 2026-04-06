import { useCallback, useState } from "react";
import { BrainCircuit, Plus, Search } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { SidebarTrigger } from "../../../components/ui/sidebar";
import { useUIStore } from "../../../stores/ui";
import { useAiConversationsQuery, useCreateAiConversation, useAiConversations } from "../index";
import { ConversationList } from "./ConversationList";
import { ConversationVisibilityFilter } from "./ConversationVisibilityFilter";

export type VisibilityFilter = "all" | "private" | "shared";

export function ConversationListContainer() {
  const { loading } = useAiConversationsQuery();
  const conversationIds = useAiConversations();
  const createConversation = useCreateAiConversation();
  const activeConversationId = useUIStore((s) => s.activeAiConversationId);
  const setActiveAiConversationId = useUIStore((s) => s.setActiveAiConversationId);

  const [searchQuery, setSearchQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");

  const handleConversationClick = useCallback(
    (id: string) => {
      setActiveAiConversationId(id);
    },
    [setActiveAiConversationId],
  );

  const handleCreateConversation = useCallback(async () => {
    const id = await createConversation({});
    if (id) {
      setActiveAiConversationId(id);
    }
  }, [createConversation, setActiveAiConversationId]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <BrainCircuit size={18} className="text-muted-foreground" />
        <h1 className="text-sm font-semibold">AI Conversations</h1>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleCreateConversation}
        >
          <Plus size={16} />
        </Button>
      </header>

      {/* Search and filter bar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <ConversationVisibilityFilter
          value={visibilityFilter}
          onChange={setVisibilityFilter}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : (
        <ConversationList
          conversationIds={conversationIds}
          activeConversationId={activeConversationId}
          onConversationClick={handleConversationClick}
          searchQuery={searchQuery}
          visibilityFilter={visibilityFilter}
        />
      )}
    </div>
  );
}
