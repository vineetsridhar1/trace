import { useState, useCallback } from "react";
import { ArrowLeft, Save, Plus, Trash2 } from "lucide-react";
import type { Channel } from "@trace/gql";
import { useEntityIds, useEntityField } from "@trace/client-core";
import type { EntityTableMap } from "@trace/client-core";
import { client } from "../../lib/urql";
import { UPDATE_CHANNEL_MUTATION } from "../../lib/mutations";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";

interface RunScript {
  name: string;
  command: string;
}

function ChannelRow({ channelId, onClick }: { channelId: string; onClick: () => void }) {
  const name = useEntityField("channels", channelId, "name") as string;
  const baseBranch = useEntityField("channels", channelId, "baseBranch") as string | null;
  const repo = useEntityField("channels", channelId, "repo") as { id: string; name: string } | null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md border border-border bg-surface-deep px-4 py-3 text-left transition-colors hover:bg-surface-elevated"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{name}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {repo && <span>{repo.name}</span>}
          {baseBranch && <span>{baseBranch}</span>}
        </div>
      </div>
      <ArrowLeft size={14} className="rotate-180 text-muted-foreground" />
    </button>
  );
}

function ChannelDetail({ channelId, onBack }: { channelId: string; onBack: () => void }) {
  const name = useEntityField("channels", channelId, "name") as string;
  const existingSetupScript = useEntityField("channels", channelId, "setupScript") as string | null;
  const existingRunScripts = useEntityField("channels", channelId, "runScripts") as RunScript[] | null;

  const [setupScript, setSetupScript] = useState(existingSetupScript ?? "");
  const [runScripts, setRunScripts] = useState<RunScript[]>(
    existingRunScripts && Array.isArray(existingRunScripts) ? existingRunScripts : [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const filteredScripts = runScripts.filter((s) => s.name.trim() && s.command.trim());
    const result = await client
      .mutation(UPDATE_CHANNEL_MUTATION, {
        id: channelId,
        input: {
          setupScript: setupScript.trim() || null,
          runScripts: filteredScripts,
        },
      })
      .toPromise();
    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }
    setDirty(false);
  }, [channelId, setupScript, runScripts]);

  function addRunScript() {
    setRunScripts([...runScripts, { name: "", command: "" }]);
    setDirty(true);
  }

  function removeRunScript(index: number) {
    setRunScripts(runScripts.filter((_, i) => i !== index));
    setDirty(true);
  }

  function updateRunScript(index: number, field: "name" | "command", value: string) {
    const updated = [...runScripts];
    updated[index] = { ...updated[index], [field]: value };
    setRunScripts(updated);
    setDirty(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Back to channels
      </button>

      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure setup and run scripts for this channel.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-surface-deep p-4">
          <h3 className="mb-1 text-sm font-medium text-foreground">Setup Script</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Runs once when a session group starts. Terminals are blocked until it completes.
          </p>
          <Textarea
            placeholder="e.g. npm install && npm run build"
            value={setupScript}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              setSetupScript(e.target.value);
              setDirty(true);
            }}
            className="min-h-[80px] font-mono text-xs"
          />
        </div>

        <div className="rounded-lg border border-border bg-surface-deep p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-foreground">Run Scripts</h3>
              <p className="text-xs text-muted-foreground">
                Named commands that open as terminals via the Run button. Max 10.
              </p>
            </div>
            {runScripts.length < 10 && (
              <Button variant="outline" size="sm" onClick={addRunScript}>
                <Plus size={14} className="mr-1.5" />
                Add
              </Button>
            )}
          </div>

          {runScripts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No run scripts configured.</p>
          ) : (
            <div className="space-y-3">
              {runScripts.map((script, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="grid flex-1 grid-cols-[1fr_2fr] gap-2">
                    <Input
                      placeholder="Name"
                      value={script.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateRunScript(index, "name", e.target.value)
                      }
                      className="text-xs"
                    />
                    <Input
                      placeholder="Command"
                      value={script.command}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateRunScript(index, "command", e.target.value)
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRunScript(index)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || saving} size="sm">
            <Save size={14} className="mr-1.5" />
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ChannelsSection() {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const codingChannelIds = useEntityIds(
    "channels",
    (ch: EntityTableMap["channels"]) => (ch as Channel & { type: string }).type === "coding",
  );

  if (selectedChannelId) {
    return (
      <ChannelDetail
        key={selectedChannelId}
        channelId={selectedChannelId}
        onBack={() => setSelectedChannelId(null)}
      />
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Channels</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure setup and run scripts for coding channels.
        </p>
      </div>

      {codingChannelIds.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-deep p-8 text-center">
          <p className="text-sm text-muted-foreground">No coding channels found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {codingChannelIds.map((id) => (
            <ChannelRow key={id} channelId={id} onClick={() => setSelectedChannelId(id)} />
          ))}
        </div>
      )}
    </div>
  );
}
