import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { FileAttachment } from "../ImageAttachmentBar";

const DEFAULT_REFERENCE_ACCEPT = ".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf";

function acceptsFile(file: File, accept: string): boolean {
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();
  return accept
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .some((value) => {
      if (value.startsWith(".")) return fileName.endsWith(value);
      if (value.endsWith("/*")) return fileType.startsWith(value.slice(0, -1));
      return fileType === value;
    });
}

export function QuestionReferenceControl({
  value,
  accept,
  attachments = [],
  onChange,
  onFiles,
  onRemoveAttachment,
}: {
  value: string;
  accept?: string;
  attachments?: FileAttachment[];
  onChange: (value: string) => void;
  onFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const entries = value.split("\n").filter(Boolean);
  const addEntry = (entry: string) => onChange([...entries, entry].join("\n"));
  const acceptedTypes = accept ?? DEFAULT_REFERENCE_ACCEPT;
  const handleFiles = useCallback(
    (files: File[]) => {
      const accepted = files.filter((file) => acceptsFile(file, acceptedTypes));
      if (accepted.length < files.length) {
        toast.error("Reference files must match the accepted file types");
      }
      if (accepted.length > 0) onFiles?.(accepted);
    },
    [acceptedTypes, onFiles],
  );
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        handleFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFiles]);
  const dropFiles = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    handleFiles(Array.from(event.dataTransfer.files));
  };
  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={dropFiles}
        className={cn(
          "grid place-items-center gap-1 rounded-lg border border-dashed px-3 py-4 transition-colors",
          dragging ? "border-foreground/40 bg-foreground/[0.08]" : "border-border",
        )}
      >
        <span className="text-[12px] font-medium">Drop a screenshot or brand guide</span>
        <span className="text-[10px] text-muted-foreground">PNG, JPG, PDF · or paste</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptedTypes}
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) handleFiles(files);
          event.target.value = "";
        }}
      />
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const url = String(form.get("reference-url") ?? "").trim();
          if (url) addEntry(url);
          event.currentTarget.reset();
        }}
      >
        <input
          name="reference-url"
          aria-label="Reference URL"
          placeholder="Paste a reference URL"
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 text-[12px] outline-none focus:border-foreground/35"
        />
        <button
          type="submit"
          className="min-h-10 rounded-lg border border-border px-3 text-[12px] font-medium text-muted-foreground"
        >
          Add
        </button>
      </form>
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
        >
          <FileText size={14} className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
            {attachment.file.name || "Attachment"}
          </span>
          <span className="font-mono text-[9px] text-muted-foreground">attached</span>
          <button
            type="button"
            aria-label={`Remove ${attachment.file.name || "attachment"}`}
            onClick={() => onRemoveAttachment?.(attachment.id)}
            className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {entries
        .filter((entry) => !attachments.some((attachment) => attachment.file.name === entry))
        .map((entry) => (
          <div
            key={entry}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
          >
            <Paperclip size={14} className="text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{entry}</span>
            <button
              type="button"
              aria-label={`Remove ${entry}`}
              onClick={() =>
                onChange(entries.filter((candidate) => candidate !== entry).join("\n"))
              }
              className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          </div>
        ))}
    </div>
  );
}
