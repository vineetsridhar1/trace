import { ExternalLink, Info, Plus, Shield, Trash2 } from "lucide-react";
import type { RepoEnvVar } from "@trace/gql";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import type { EnvTarget } from "./useSessionAutomationDraft";

export function SessionAutomationEnvVars({
  env,
  target,
  secretNames,
  onAdd,
  onRemove,
  onUpdate,
  onManageSecrets,
}: {
  env: RepoEnvVar[];
  target: EnvTarget;
  secretNames: string[];
  onAdd: (target: EnvTarget) => void;
  onRemove: (target: EnvTarget, index: number) => void;
  onUpdate: (target: EnvTarget, index: number, patch: Partial<RepoEnvVar>) => void;
  onManageSecrets: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium text-muted-foreground">Environment variables</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onManageSecrets}
            className="h-8 px-2.5 text-[13px] text-muted-foreground"
          >
            <ExternalLink size={13} />
            Manage secrets
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAdd(target)}
            className="h-8 px-2.5 text-[13px] text-muted-foreground"
          >
            <Plus size={13} />
            Add variable
          </Button>
        </div>
      </div>
      {env.length ? (
        <div className="space-y-2">
          {env.map((entry, index) => {
            const missing = Boolean(entry.secretName) && !secretNames.includes(entry.secretName);
            return (
              <div key={index}>
                <div className="grid grid-cols-[200px_1fr_32px] items-center gap-2">
                  <Input
                    aria-label={`Environment variable ${index + 1} name`}
                    value={entry.key}
                    placeholder="VARIABLE_NAME"
                    onChange={(event) =>
                      onUpdate(target, index, { key: event.target.value.toUpperCase() })
                    }
                    className="h-9 border-border bg-background px-3 font-mono text-xs focus-visible:ring-2 focus-visible:ring-primary/25"
                  />
                  <Select
                    value={entry.secretName || undefined}
                    onValueChange={(value) =>
                      onUpdate(target, index, { secretName: value ?? "" })
                    }
                  >
                    <SelectTrigger
                      aria-invalid={missing || undefined}
                      className="w-full"
                    >
                      <SelectValue placeholder="Select secret">
                        <span
                          className={cn(
                            "flex min-w-0 items-center gap-1.5",
                            missing && "text-destructive",
                          )}
                        >
                          {entry.secretName ? <Shield size={13} className="shrink-0" /> : null}
                          <span className="truncate font-mono text-xs">
                            {entry.secretName || "Select secret"}
                          </span>
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {secretNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          <span className="flex items-center gap-2">
                            <Shield size={13} className="text-muted-foreground" />
                            <span className="font-mono text-xs">{name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove environment variable ${entry.key || index + 1}`}
                    onClick={() => onRemove(target, index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                {missing ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
                    <Info size={12} className="shrink-0" />
                    This secret was removed from workspace Secrets — pick a replacement.
                  </p>
                ) : null}
                {!entry.key && !entry.secretName ? (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-4 text-muted-foreground">
                    <Info size={12} className="mt-0.5 shrink-0" />
                    Name the variable your command reads. Its value is pulled from the chosen secret
                    when the runtime starts — the secret value is never shown or stored here.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          None — add one to expose a workspace secret here.
        </p>
      )}
    </div>
  );
}
