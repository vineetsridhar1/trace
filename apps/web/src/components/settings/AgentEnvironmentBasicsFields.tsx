import { Input } from "../ui/input";
import type {
  AgentEnvironmentDraft,
  UpdateAgentEnvironmentDraft,
} from "./agent-environment-form-types";

type Props = {
  draft: AgentEnvironmentDraft;
  update: UpdateAgentEnvironmentDraft;
};

export function AgentEnvironmentBasicsFields({ draft, update }: Props) {
  return (
    <label className="space-y-4">
      <span className="text-xs font-medium text-muted-foreground">Name</span>
      <Input value={draft.name} onChange={(event) => update("name", event.target.value)} required />
    </label>
  );
}
