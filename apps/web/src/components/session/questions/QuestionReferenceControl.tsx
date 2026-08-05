import { useRef } from "react";
import { Paperclip, X } from "lucide-react";

export function QuestionReferenceControl({
  value,
  accept,
  onChange,
}: {
  value: string;
  accept?: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const entries = value.split("\n").filter(Boolean);
  const addEntry = (entry: string) => onChange([...entries, entry].join("\n"));
  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="grid place-items-center gap-1 rounded-lg border border-dashed border-border bg-surface-deep/55 px-3 py-5"
      >
        <Paperclip size={16} className="text-muted-foreground" />
        <span className="text-[12px] font-medium">Drop a screenshot or brand guide</span>
        <span className="text-[11px] text-muted-foreground">
          PNG, JPG, PDF · or paste from clipboard
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) addEntry(file.name);
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
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface-deep/55 px-3 text-[12px] outline-none focus:border-foreground/35"
        />
        <button
          type="submit"
          className="min-h-10 rounded-lg border border-border px-3 text-[12px] font-medium text-muted-foreground"
        >
          Add
        </button>
      </form>
      {entries.map((entry) => (
        <div
          key={entry}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface-deep/55 px-3 py-2"
        >
          <Paperclip size={14} className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{entry}</span>
          <button
            type="button"
            aria-label={`Remove ${entry}`}
            onClick={() => onChange(entries.filter((candidate) => candidate !== entry).join("\n"))}
            className="grid h-7 w-7 place-items-center rounded border border-border text-muted-foreground"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
