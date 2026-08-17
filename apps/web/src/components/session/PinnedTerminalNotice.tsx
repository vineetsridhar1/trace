import { ArrowUpRight, Pin } from "lucide-react";
import { Button } from "../ui/button";

export function PinnedTerminalNotice({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="flex max-w-xs flex-col items-center text-center">
        <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Pin className="size-4 fill-current" />
        </div>
        <p className="text-sm font-medium text-foreground">Terminal opened in the main panel</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          A terminal can only appear in one place at a time.
        </p>
        <Button className="mt-4" size="sm" variant="secondary" onClick={onOpen}>
          Open terminal tab
          <ArrowUpRight />
        </Button>
      </div>
    </div>
  );
}
