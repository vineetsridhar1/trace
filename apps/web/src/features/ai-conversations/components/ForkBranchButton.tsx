import { useState, useCallback, useRef } from "react";
import { GitBranch } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../../../components/ui/tooltip";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../../../components/ui/popover";
import { useForkBranch } from "../hooks/useAiConversationMutations";

interface ForkBranchButtonProps {
  turnId: string;
  onForked?: (branchId: string) => void;
}

export function ForkBranchButton({ turnId, onForked }: ForkBranchButtonProps) {
  const forkBranch = useForkBranch();
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [label, setLabel] = useState("");
  const [forking, setForking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFork = useCallback(
    async (branchLabel?: string) => {
      setForking(true);
      try {
        const newBranchId = await forkBranch({
          turnId,
          label: branchLabel || undefined,
        });
        if (newBranchId) {
          onForked?.(newBranchId);
        }
      } finally {
        setForking(false);
        setShowLabelInput(false);
        setLabel("");
      }
    },
    [forkBranch, turnId, onForked],
  );

  const handleLabelSubmit = useCallback(() => {
    handleFork(label.trim() || undefined);
  }, [handleFork, label]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleLabelSubmit();
      } else if (e.key === "Escape") {
        setShowLabelInput(false);
        setLabel("");
      }
    },
    [handleLabelSubmit],
  );

  if (showLabelInput) {
    return (
      <Popover
        open={showLabelInput}
        onOpenChange={(open) => {
          if (!open) {
            setShowLabelInput(false);
            setLabel("");
          }
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={forking}
              className="text-muted-foreground"
            >
              <GitBranch className="size-3.5" />
            </Button>
          }
        />
        <PopoverContent side="top" align="start" className="w-60 p-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              Branch label (optional)
            </label>
            <input
              ref={inputRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. try different approach"
              disabled={forking}
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
              autoFocus
            />
            <div className="flex items-center gap-1.5 justify-end">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleFork()}
                disabled={forking}
              >
                Skip
              </Button>
              <Button
                variant="default"
                size="xs"
                onClick={handleLabelSubmit}
                disabled={forking}
              >
                Create
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowLabelInput(true)}
            disabled={forking}
            className="text-muted-foreground opacity-0 group-hover/turn:opacity-100 transition-opacity"
          >
            <GitBranch className="size-3.5" />
          </Button>
        }
      />
      <TooltipContent side="top">Branch from here</TooltipContent>
    </Tooltip>
  );
}
