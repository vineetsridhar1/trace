import { AnimatePresence, motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAiConversationField,
  useBranchTreePanelOpen,
} from "../hooks/useAiConversationSelectors";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";
import { BranchTreeNodeContainer } from "./BranchTreeNode";

const PANEL_WIDTH = 240;

interface BranchTreePanelProps {
  conversationId: string;
}

export function BranchTreePanel({ conversationId }: BranchTreePanelProps) {
  const isOpen = useBranchTreePanelOpen();
  const togglePanel = useAiConversationUIStore((s) => s.toggleBranchTreePanel);
  const rootBranchId = useAiConversationField(conversationId, "rootBranchId");

  return (
    <div className="relative flex shrink-0">
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: PANEL_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="flex h-full flex-col overflow-hidden border-r border-border bg-surface-deep"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <GitBranch className="h-4 w-4" />
                Branches
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={togglePanel}
                aria-label="Collapse branch panel"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>

            {/* Tree content with horizontal scroll for deep trees */}
            <div className="flex-1 overflow-y-auto overflow-x-auto py-1">
              <div className="min-w-fit">
                {rootBranchId && (
                  <BranchTreeNodeContainer
                    branchId={rootBranchId}
                    conversationId={conversationId}
                  />
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Toggle button when collapsed */}
      {!isOpen && (
        <div className="flex items-start pt-2 pl-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={togglePanel}
            aria-label="Expand branch panel"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
