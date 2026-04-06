import { useCallback, useMemo } from "react";
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
} from "@/components/ui/command";
import { useEntityStore, type AiBranchEntity } from "@/stores/entity";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";
import { BranchSwitcherItem } from "./BranchSwitcherItem";

interface BranchSwitcherProps {
  conversationId: string;
}

export function BranchSwitcher({ conversationId }: BranchSwitcherProps) {
  const open = useAiConversationUIStore((s) => s.branchSwitcherOpen);
  const setBranchSwitcherOpen = useAiConversationUIStore(
    (s) => s.setBranchSwitcherOpen,
  );
  const setActiveBranch = useAiConversationUIStore((s) => s.setActiveBranch);
  const activeBranchId = useAiConversationUIStore(
    (s) => s.activeBranchByConversation[conversationId],
  );

  // Get sorted branch IDs for this conversation
  const branchIds = useEntityStore((state) => {
    const conversation = state.aiConversations[conversationId];
    if (!conversation) return [];

    const ids = conversation.branchIds;
    // Sort by createdAt descending (most recent first), with root branch always first
    const branches = ids
      .map((id) => state.aiBranches[id])
      .filter((b): b is AiBranchEntity => b != null);

    branches.sort((a, b) => {
      // Root branch (depth 0, no parent) always first
      if (!a.parentBranchId && b.parentBranchId) return -1;
      if (a.parentBranchId && !b.parentBranchId) return 1;
      // Then by createdAt descending
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });

    return branches.map((b) => b.id);
  });

  const handleSelect = useCallback(
    (branchId: string) => {
      setActiveBranch(conversationId, branchId);
      setBranchSwitcherOpen(false);
    },
    [conversationId, setActiveBranch, setBranchSwitcherOpen],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setBranchSwitcherOpen(nextOpen);
    },
    [setBranchSwitcherOpen],
  );

  if (branchIds.length === 0) return null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Switch Branch"
      description="Search and select a branch to switch to"
    >
      <Command>
        <CommandInput placeholder="Search branches..." />
        <CommandList>
          <CommandEmpty>No branches found.</CommandEmpty>
          <CommandGroup heading="Branches">
            {branchIds.map((id) => (
              <BranchSwitcherItem
                key={id}
                branchId={id}
                isActive={id === activeBranchId}
                onSelect={handleSelect}
              />
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
