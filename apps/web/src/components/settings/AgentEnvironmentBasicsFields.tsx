import { Input } from "../ui/input";
import type {
  AgentEnvironmentDraft,
  UpdateAgentEnvironmentDraft,
} from "./agent-environment-form-types";
import { AgentEnvironmentFieldLabel } from "./AgentEnvironmentFieldLabel";

type Props = {
  draft: AgentEnvironmentDraft;
  update: UpdateAgentEnvironmentDraft;
};

export function AgentEnvironmentBasicsFields({ draft, update }: Props) {
  return (
    <label className="space-y-1.5">
      <AgentEnvironmentFieldLabel tooltip="A human-readable name shown when users choose this provisioned runtime.">
        Name
      </AgentEnvironmentFieldLabel>
      <Input value={draft.name} onChange={(event) => update("name", event.target.value)} required />
    </label>
  );
}
