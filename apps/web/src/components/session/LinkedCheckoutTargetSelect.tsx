import { Monitor } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type {
  LinkedCheckoutHeaderState,
  LinkedCheckoutTargetOption,
} from "./useLinkedCheckoutHeaderState";

interface Props {
  state: LinkedCheckoutHeaderState;
}

export function LinkedCheckoutTargetSelect({ state }: Props) {
  if (!state.canSelectTarget || !state.targetRuntimeInstanceId) return null;

  return (
    <Select
      value={state.targetRuntimeInstanceId}
      onValueChange={(value: string | null) => {
        if (value) state.onSelectTarget(value);
      }}
    >
      <SelectTrigger
        size="sm"
        className="max-w-40 min-w-0 border-border bg-surface px-2 text-xs sm:max-w-52"
        title={`Checkout target: ${state.targetDisplayLabel}`}
      >
        <SelectValue>
          <span className="flex min-w-0 items-center gap-1.5">
            <Monitor size={13} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{state.targetDisplayLabel}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="w-72">
        <SelectGroup>
          <SelectLabel>Checkout target</SelectLabel>
          {state.targetOptions.map((option: LinkedCheckoutTargetOption) => (
            <SelectItem key={option.instanceId} value={option.instanceId}>
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="flex max-w-full items-center gap-1.5">
                  <Monitor size={12} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{option.label}</span>
                </span>
                <span className="text-xs text-muted-foreground">{targetOptionDetail(option)}</span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function targetOptionDetail(option: LinkedCheckoutTargetOption): string {
  if (option.isAttachedToGroup) return "Attached to this session";
  if (option.repoRegistered && option.isCurrentDesktop) return "Repo linked on this desktop";
  if (option.repoRegistered) return "Repo linked";
  if (option.isCurrentDesktop) return "This desktop";
  return "Repo not linked";
}
