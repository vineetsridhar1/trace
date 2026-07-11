import { Plus, Trash2 } from "lucide-react";
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
        <AgentEnvironmentFieldLabel tooltip="Expose selected organization secrets inside cloud runtimes. The AI and app processes can use variables such as DATABASE_URL without storing credentials in git.">
          Runtime environment variables
        </AgentEnvironmentFieldLabel>
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
          <div key={`${index}-${entry.secretId}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              aria-label={`Runtime variable ${index + 1} name`}
              placeholder="DATABASE_URL"
              value={entry.name}
              onChange={(event) => updateEntry(index, "name", event.target.value.toUpperCase())}
            />
            <Select
              value={secret?.id}
              onValueChange={(value) => updateEntry(index, "secretId", value ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select secret">
                  {secret?.name ?? "Select secret"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {orgSecrets.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
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
        <p className="text-xs text-muted-foreground">
          Add database or service credentials from organization secrets when apps need them.
        </p>
      ) : null}
    </div>
  );
}
