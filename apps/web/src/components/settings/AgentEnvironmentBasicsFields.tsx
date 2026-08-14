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
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        Name
        <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-medium text-muted-foreground">
          Required
        </span>
      </span>
      <Input
        value={draft.name}
        onChange={(event) => update("name", event.target.value)}
        className="h-9 bg-background text-[13px]"
        required
      />
    </label>
  );
}
