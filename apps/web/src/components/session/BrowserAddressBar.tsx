import { useId } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function BrowserAddressBar({
  addressHistory,
  canGoBack,
  canGoForward,
  inputValue,
  loading,
  syncStatusColor,
  syncStatusLabel,
  onAddressBlur,
  onAddressFocus,
  onGoBack,
  onGoForward,
  onInputChange,
  onNavigate,
  onReload,
}: {
  addressHistory: string[];
  canGoBack: boolean;
  canGoForward: boolean;
  inputValue: string;
  loading: boolean;
  syncStatusColor: string;
  syncStatusLabel: string;
  onAddressBlur: () => void;
  onAddressFocus: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onInputChange: (value: string) => void;
  onNavigate: () => void;
  onReload: () => void;
}) {
  const historyListId = useId();

  return (
    <form
      className="app-region-drag flex shrink-0 items-center gap-2 border-b border-border bg-surface-mid px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        onNavigate();
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="app-region-no-drag h-7 w-7"
        disabled={!canGoBack}
        onClick={onGoBack}
        aria-label="Back"
      >
        <ChevronLeft size={16} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="app-region-no-drag h-7 w-7"
        disabled={!canGoForward}
        onClick={onGoForward}
        aria-label="Forward"
      >
        <ChevronRight size={16} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="app-region-no-drag h-7 w-7"
        onClick={onReload}
        aria-label="Reload"
      >
        {loading ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />}
      </Button>
      <Input
        value={inputValue}
        list={historyListId}
        onChange={(event) => onInputChange(event.target.value)}
        onFocus={(event) => {
          onAddressFocus();
          event.currentTarget.select();
        }}
        onClick={(event) => event.currentTarget.select()}
        onBlur={onAddressBlur}
        className="app-region-no-drag h-8 flex-1 bg-background/70 text-xs"
        aria-label="Browser URL"
        placeholder="Enter a URL"
        spellCheck={false}
      />
      <datalist id={historyListId}>
        {addressHistory.map((address) => (
          <option key={address} value={address} />
        ))}
      </datalist>
      <span
        className="app-region-no-drag flex h-7 items-center gap-1.5 px-1.5 text-xs text-muted-foreground"
        title={syncStatusLabel}
        aria-label={syncStatusLabel}
      >
        <span className={cn("h-2 w-2 rounded-full", syncStatusColor)} />
        Sync
      </span>
    </form>
  );
}
