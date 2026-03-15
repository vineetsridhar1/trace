import { formatTime } from "./utils";
import { stripPromptWrapping } from "../interactionModes";

export function UserBubble({ text, timestamp }: { text: string; timestamp: string }) {
  const displayText = stripPromptWrapping(text);

  return (
    <div className="flex justify-end">
      <div className="user-prompt-bubble max-w-[85%] px-3 py-2">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-accent">You</span>
          <span className="text-[10px] text-muted-foreground">{formatTime(timestamp)}</span>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{displayText}</p>
      </div>
    </div>
  );
}
