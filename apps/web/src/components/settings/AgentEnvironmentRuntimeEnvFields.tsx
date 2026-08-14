import { Plus, Shield, Trash2 } from "lucide-react";
import type { OrgSecret } from "@trace/gql";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type {
  AgentEnvironmentDraft,
  UpdateAgentEnvironmentDraft,
} from "./agent-environment-form-types";
import { AgentEnvironmentFieldLabel } from "./AgentEnvironmentFieldLabel";

type Props = {
  draft: AgentEnvironmentDraft;
  orgSecrets: OrgSecret[];
  update: UpdateAgentEnvironmentDraft;
};

export function AgentEnvironmentRuntimeEnvFields({ draft, orgSecrets, update }: Props) {
  function updateEntry(index: number, field: "name" | "secretId", value: string) {
    update(
      "runtimeEnv",
      draft.runtimeEnv.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Runtime environment variables
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!orgSecrets.length}
          onClick={() => update("runtimeEnv", [...draft.runtimeEnv, { name: "", secretId: "" }])}
        >
          <Plus size={14} className="mr-1.5" />
          Add variable
        </Button>
      </div>
      {draft.runtimeEnv.map((entry, index) => {
        const secret = orgSecrets.find((item) => item.id === entry.secretId);
        return (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <Input
              aria-label={`Runtime variable ${index + 1} name`}
              placeholder="DATABASE_URL"
              value={entry.name}
              onChange={(event) => updateEntry(index, "name", event.target.value.toUpperCase())}
              className="h-9 bg-background font-mono text-xs"
            />
            <Select
              value={secret?.id}
              onValueChange={(value) => updateEntry(index, "secretId", value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select secret">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {secret ? (
                      <Shield size={13} className="shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className="truncate font-mono text-xs">
                      {secret?.name ?? "Select secret"}
                    </span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {orgSecrets.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <Shield size={13} />
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove runtime variable ${index + 1}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() =>
                update(
                  "runtimeEnv",
                  draft.runtimeEnv.filter((_, entryIndex) => entryIndex !== index),
                )
              }
            >
              <Trash2 size={14} />
            </Button>
          </div>
        );
      })}
      {!draft.runtimeEnv.length ? (
        <p className="text-xs text-muted-foreground">No runtime variables added.</p>
      ) : null}
      <p className="text-xs leading-4 text-muted-foreground">
        Injected when a runtime starts, so sessions read credentials without committing them.
      </p>
    </div>
  );
}
