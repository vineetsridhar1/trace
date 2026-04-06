import { useState } from "react";
import { GitBranch } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useTurnField,
  useChildBranchIds,
} from "../hooks/useAiConversationSelectors";
import { BranchPopoverList } from "./BranchPopoverList";

interface BranchIndicatorProps {
  turnId: string;
  conversationId: string;
}

/**
 * Renders a subtle branch-count badge on turns that have child branches.
 * Clicking the badge opens a popover listing the child branches.
 */
export function BranchIndicator({ turnId, conversationId }: BranchIndicatorProps) {
  const branchCount = useTurnField(turnId, "branchCount");
  const childBranchIds = useChildBranchIds(turnId);
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (!branchCount || branchCount === 0) return null;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
          "text-xs text-muted-foreground",
          "bg-muted/50 hover:bg-muted transition-colors cursor-pointer",
          "border border-border/50",
        )}
        aria-label={`${branchCount} branch${branchCount === 1 ? "" : "es"} from this turn`}
      >
        <GitBranch className="h-3 w-3" />
        <AnimatePresence mode="popLayout">
          <motion.span
            key={branchCount}
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.5 }}
            className="tabular-nums"
          >
            {branchCount}
          </motion.span>
        </AnimatePresence>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" sideOffset={6} className="w-64 p-1.5">
        <BranchPopoverList
          childBranchIds={childBranchIds}
          conversationId={conversationId}
          onSelect={() => setPopoverOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
