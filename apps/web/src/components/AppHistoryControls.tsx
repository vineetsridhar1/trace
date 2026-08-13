import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";

export function AppHistoryControls() {
  return (
    <div className="flex shrink-0 items-center" aria-label="Navigation history">
      <Button
        aria-label="Go back"
        className="h-7 w-6 cursor-pointer rounded-r-none text-foreground hover:bg-white/10"
        onClick={() => history.back()}
        size="icon-sm"
        title="Back"
        variant="ghost"
      >
        <ChevronLeft />
      </Button>
      <Button
        aria-label="Go forward"
        className="h-7 w-6 cursor-pointer rounded-l-none text-foreground hover:bg-white/10"
        onClick={() => history.forward()}
        size="icon-sm"
        title="Forward"
        variant="ghost"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
