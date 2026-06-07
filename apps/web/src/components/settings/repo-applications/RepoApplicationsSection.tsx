import { useMemo, useState } from "react";
import { Save, Plus } from "lucide-react";
import { useEntityField, useEntityStore } from "@trace/client-core";
import type { RepoApplicationConfig } from "@trace/gql";
import { UPDATE_REPO_MUTATION } from "@trace/client-core";
import { client } from "../../../lib/urql";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";

const EMPTY_CONFIG: RepoApplicationConfig = { setupScripts: [], applications: [] };

function pretty(config: RepoApplicationConfig | undefined): string {
  return JSON.stringify(config ?? EMPTY_CONFIG, null, 2);
}

function parseConfig(value: string): RepoApplicationConfig {
  const parsed = JSON.parse(value) as RepoApplicationConfig;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Config must be an object");
  }
  return {
    setupScripts: Array.isArray(parsed.setupScripts) ? parsed.setupScripts : [],
    applications: Array.isArray(parsed.applications) ? parsed.applications : [],
  };
}

export function RepoApplicationsSection({ repoId }: { repoId: string }) {
  const applicationConfig = useEntityField("repos", repoId, "applicationConfig") as
    | RepoApplicationConfig
    | undefined;
  const initialValue = useMemo(() => pretty(applicationConfig), [applicationConfig]);
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addExample = () => {
    setValue(
      pretty({
        setupScripts: [
          { id: "install", name: "Install", command: "pnpm install", workingDirectory: "." },
        ],
        applications: [
          {
            id: "web",
            name: "Web",
            processes: [
              {
                id: "dev",
                name: "Dev server",
                command: "pnpm dev --host 0.0.0.0 --port 3000",
                workingDirectory: ".",
                required: true,
                ports: [
                  {
                    id: "web",
                    label: "Web",
                    port: 3000,
                    protocol: "http",
                    defaultForwardingEnabled: true,
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const config = parseConfig(value);
      const result = await client
        .mutation(UPDATE_REPO_MUTATION, {
          id: repoId,
          input: { applicationConfig: config },
        })
        .toPromise();
      if (result.error) throw result.error;
      useEntityStore.getState().patch("repos", repoId, { applicationConfig: config });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save applications");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Applications</p>
          <p className="text-xs text-muted-foreground">Setup scripts and managed cloud processes.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={addExample}>
            <Plus size={14} />
            Example
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save size={14} />
            {saving ? "Saving" : "Save"}
          </Button>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="min-h-[220px] font-mono text-xs"
        spellCheck={false}
      />
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
