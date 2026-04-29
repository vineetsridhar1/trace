import { CheckCircle2, Loader2, MoreHorizontal, PlugZap, Star, Trash2 } from "lucide-react";
import type { AgentEnvironment } from "@trace/gql";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  environmentConfig,
  formatAdapterType,
  supportedToolsFromConfig,
} from "./agent-environment-utils";

type TestResult = {
  ok: boolean;
  message?: string | null;
};

type Props = {
  environment: AgentEnvironment;
  pendingActionId: string | null;
  testResult?: TestResult;
  onEdit: () => void;
  onSetDefault: () => void;
  onToggleEnabled: () => void;
  onTest: () => void;
  onDelete: () => void;
};

export function AgentEnvironmentRow({
  environment,
  pendingActionId,
  testResult,
  onEdit,
  onSetDefault,
  onToggleEnabled,
  onTest,
  onDelete,
}: Props) {
  const config = environmentConfig(environment);
  const tools = supportedToolsFromConfig(config);
  const pending = pendingActionId === environment.id;

  return (
    <div className="rounded-lg border border-border bg-surface-deep p-4">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-medium text-foreground">{environment.name}</h3>
            {environment.isDefault ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                <Star size={11} />
                Default
              </span>
            ) : null}
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                environment.enabled
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {environment.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{formatAdapterType(environment.adapterType)}</span>
            {tools.length ? <span>{tools.join(", ")}</span> : <span>All supported tools</span>}
            {environment.adapterType === "local" && config.runtimeInstanceId ? (
              <span>{config.runtimeInstanceId}</span>
            ) : null}
            {environment.adapterType === "provisioned" && config.statusUrl ? (
              <span className="truncate">{config.statusUrl}</span>
            ) : null}
          </div>
          {testResult ? (
            <p
              className={cn(
                "mt-2 text-xs",
                testResult.ok ? "text-green-600 dark:text-green-400" : "text-destructive",
              )}
            >
              {testResult.message ??
                (testResult.ok ? "Connection test passed" : "Connection test failed")}
            </p>
          ) : null}
        </button>

        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onTest}
          className="shrink-0"
        >
          {pending ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <PlugZap size={14} className="mr-1.5" />
          )}
          Test
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground">
            <MoreHorizontal size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            {!environment.isDefault && environment.enabled ? (
              <DropdownMenuItem onClick={onSetDefault}>
                <CheckCircle2 size={14} />
                Set default
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={onToggleEnabled}>
              {environment.enabled ? "Disable" : "Enable"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 size={14} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
