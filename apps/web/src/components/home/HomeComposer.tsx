import { useEffect, useRef, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip } from "lucide-react";
import type { CodingTool, Repo, SessionGroupKind } from "@trace/gql";
import { toast } from "sonner";
import { useHomeComposerStore } from "../../stores/home-composer";
import { HomeRepoPicker } from "./HomeRepoPicker";
import { HomeToolPicker } from "./HomeToolPicker";

export function HomeComposer({
  prompt,
  kind,
  repos,
  repoId,
  tool,
  submitting,
  onPromptChange,
  onRepoChange,
  onToolChange,
  onSubmit,
}: {
  prompt: string;
  kind: SessionGroupKind | null;
  repos: Repo[];
  repoId: string | null;
  tool: CodingTool;
  submitting: boolean;
  onPromptChange: (prompt: string) => void;
  onRepoChange: (repoId: string | null) => void;
  onToolChange: (tool: CodingTool) => void;
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusRequest = useHomeComposerStore((state) => state.focusRequest);
  const prefill = useHomeComposerStore((state) => state.prefill);
  const consumePrefill = useHomeComposerStore((state) => state.consumePrefill);
  const canSubmit = prompt.trim().length > 0 && !submitting;

  useEffect(() => {
    textareaRef.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (!prefill) return;
    onPromptChange(prefill.text);
    consumePrefill(prefill.id);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [consumePrefill, onPromptChange, prefill]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 70), 180)}px`;
  }, [prompt]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSubmit) onSubmit();
  };

  return (
    <div className="home-composer-shadow relative mx-auto w-full max-w-[720px] overflow-visible rounded-[14px] border border-[var(--th-edge-strong)] bg-[var(--th-raised)]">
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        aria-label="What do you want to make?"
        placeholder="Describe what you want to make…"
        className="block min-h-[86px] w-full resize-none bg-transparent px-[18px] pb-2 pt-4 text-[15px] leading-[1.55] text-[var(--th-heading)] caret-[var(--th-accent-light)] outline-none placeholder:text-[var(--th-faint)]"
      />
      <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 pb-3 pt-2">
        <button
          type="button"
          onClick={() =>
            toast.info("Start the session first, then add attachments in its composer.")
          }
          title="Attachments are available after the session starts"
          className="btn-ghost flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--th-muted)]"
        >
          <Paperclip className="size-3.5" />
          <span className="sr-only">Attach a file</span>
        </button>
        <HomeRepoPicker
          repos={repos}
          selectedRepoId={repoId}
          disabled={kind !== null && kind !== "coding"}
          onSelect={onRepoChange}
        />
        <HomeToolPicker tool={tool} onSelect={onToolChange} />
        <span className="ml-auto hidden text-[11px] text-[var(--th-faint)] sm:block">
          ⏎ to start
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-label="Start session"
          className="btn-primary flex size-[30px] shrink-0 items-center justify-center rounded-lg disabled:pointer-events-none disabled:opacity-40"
          style={{
            boxShadow: canSubmit
              ? "0 0 12px color-mix(in srgb, var(--th-accent) 35%, transparent)"
              : undefined,
          }}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  );
}
