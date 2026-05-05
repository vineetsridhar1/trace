import { useState } from "react";
import type { MouseEvent } from "react";
import { Clock } from "lucide-react";
import { SAVE_SESSION_GROUP_FOR_LATER_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import type { SessionGroupRow } from "./sessions-table-types";

export function SessionSaveForLaterButton({ row }: { row: SessionGroupRow }) {
  const [saving, setSaving] = useState(false);
  const hidden = row.archivedAt || row.savedAt || row.displaySessionStatus === "merged";
  if (hidden) return null;

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setSaving(true);
    try {
      const result = await client
        .mutation(SAVE_SESSION_GROUP_FOR_LATER_MUTATION, { id: row.id })
        .toPromise();
      if (result.error) {
        console.warn("[saveSessionGroupForLater] failed", result.error);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      className={cn(
        "ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground",
        saving && "opacity-50",
      )}
      disabled={saving}
      title="Save for later"
      aria-label={`Save ${row.name} for later`}
      onClick={handleClick}
    >
      <Clock className="size-3.5" />
    </button>
  );
}
