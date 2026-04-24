import { useEffect, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { useEntityField, UPDATE_REPO_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function RepoWebPreviewPortField({ repoId }: { repoId: string }) {
  const currentPort = useEntityField("repos", repoId, "webPreviewPort") as number | null | undefined;
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(currentPort == null ? "" : String(currentPort));
  }, [currentPort]);

  const normalizedCurrent = currentPort == null ? "" : String(currentPort);
  const dirty = draft !== normalizedCurrent;

  async function save() {
    const trimmed = draft.trim();
    const nextPort =
      trimmed === ""
        ? null
        : Number.isInteger(Number(trimmed))
          ? Number(trimmed)
          : Number.NaN;

    if (
      trimmed !== "" &&
      (typeof nextPort !== "number" ||
        !Number.isInteger(nextPort) ||
        nextPort < 1 ||
        nextPort > 65535)
    ) {
      setError("Enter a port between 1 and 65535.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await client
        .mutation(UPDATE_REPO_MUTATION, {
          id: repoId,
          input: { webPreviewPort: nextPort },
        })
        .toPromise();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border/70 bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">Web Preview Port</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Leave blank to disable in-app web preview for this repo.
          </p>
        </div>
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="3000"
          className="h-8 w-28"
        />
        <Button variant="outline" size="sm" onClick={save} disabled={!dirty || saving}>
          <Save size={14} />
          Save
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft(normalizedCurrent);
            setError(null);
          }}
          disabled={!dirty || saving}
        >
          <RotateCcw size={14} />
          Reset
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
