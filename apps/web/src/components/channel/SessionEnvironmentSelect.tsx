import { useEffect, useState } from "react";
import { gql } from "@urql/core";
import { useAuthStore } from "@trace/client-core";
import type { AgentEnvironment, CodingTool } from "@trace/gql";
import { Cloud, Monitor } from "lucide-react";
import { client } from "../../lib/urql";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

type SessionEnvironmentOption = Pick<
  AgentEnvironment,
  "id" | "name" | "adapterType" | "config" | "enabled" | "isDefault"
>;

export type SessionEnvironmentSelection = {
  adapterType: AgentEnvironment["adapterType"];
  runtimeInstanceId: string | null;
  runtimeSelection: string | null;
};

interface SessionEnvironmentsQueryResult {
  agentEnvironments?: SessionEnvironmentOption[];
}

type Props = {
  tool: string;
  selectedTarget: string | null;
  onSelectionChange: (target: string | null, selection?: SessionEnvironmentSelection | null) => void;
};

export const CLOUD_SESSION_TARGET = "__cloud__";

const SESSION_ENVIRONMENTS_QUERY = gql`
  query SessionEnvironmentOptions($orgId: ID!) {
    agentEnvironments(orgId: $orgId) {
      id
      name
      adapterType
      config
      enabled
      isDefault
    }
  }
`;

export function SessionEnvironmentSelect({
  tool,
  selectedTarget,
  onSelectionChange,
}: Props) {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const [environments, setEnvironments] = useState<SessionEnvironmentOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!activeOrgId) {
      setEnvironments([]);
      onSelectionChange(CLOUD_SESSION_TARGET, null);
      return () => {
        cancelled = true;
      };
    }

    client
      .query<SessionEnvironmentsQueryResult>(
        SESSION_ENVIRONMENTS_QUERY,
        { orgId: activeOrgId },
        { requestPolicy: "network-only" },
      )
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        const enabled = (result.data?.agentEnvironments ?? [])
          .filter((environment) => environment.enabled)
          .filter((environment) => environmentSupportsTool(environment, tool))
          .sort(compareEnvironments);
        setEnvironments(enabled);
        const target = resolveSelectedTarget(enabled, selectedTarget);
        onSelectionChange(
          target,
          target && target !== CLOUD_SESSION_TARGET
            ? environmentSelection(enabled.find((environment) => environment.id === target))
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setEnvironments([]);
          onSelectionChange(CLOUD_SESSION_TARGET, null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, onSelectionChange, tool]);

  const selectedEnvironment =
    selectedTarget === CLOUD_SESSION_TARGET
      ? undefined
      : environments.find((environment) => environment.id === selectedTarget);
  const explicitEnvironments = environments.filter(
    (environment) =>
      environment.adapterType === "local" ||
      (environment.adapterType === "provisioned" && !environment.isDefault),
  );

  return (
    <Select
      value={selectedTarget ?? CLOUD_SESSION_TARGET}
      onValueChange={(target) =>
        onSelectionChange(
          target,
          target !== CLOUD_SESSION_TARGET
            ? environmentSelection(environments.find((environment) => environment.id === target))
            : null,
        )
      }
    >
      <SelectTrigger className="h-7 w-auto max-w-48 gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
        <SelectValue>
          {selectedTarget === CLOUD_SESSION_TARGET ? (
            <CloudLabel />
          ) : (
            <EnvironmentLabel environment={selectedEnvironment} />
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CLOUD_SESSION_TARGET}>
          <CloudLabel />
        </SelectItem>
        {explicitEnvironments.map((environment) => (
          <SelectItem key={environment.id} value={environment.id}>
            <EnvironmentLabel environment={environment} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function resolveSelectedTarget(
  environments: SessionEnvironmentOption[],
  current: string | null,
): string | null {
  if (current === CLOUD_SESSION_TARGET) return current;
  if (current && environments.some((environment) => environment.id === current)) return current;
  const defaultEnvironment = environments.find((environment) => environment.isDefault);
  if (!defaultEnvironment) return CLOUD_SESSION_TARGET;
  return defaultEnvironment.adapterType === "provisioned"
    ? CLOUD_SESSION_TARGET
    : defaultEnvironment.id;
}

function compareEnvironments(a: SessionEnvironmentOption, b: SessionEnvironmentOption): number {
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function environmentSupportsTool(environment: SessionEnvironmentOption, tool: string): boolean {
  const config = environment.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return true;
  const capabilities = (config as Record<string, unknown>).capabilities;
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) return true;
  const supportedTools = (capabilities as Record<string, unknown>).supportedTools;
  return (
    !Array.isArray(supportedTools) ||
    supportedTools.length === 0 ||
    supportedTools.includes(tool as CodingTool)
  );
}

function environmentSelection(
  environment: SessionEnvironmentOption | undefined,
): SessionEnvironmentSelection | null {
  if (!environment) return null;
  const config = configRecord(environment);
  return {
    adapterType: environment.adapterType,
    runtimeInstanceId: stringField(config.runtimeInstanceId),
    runtimeSelection: stringField(config.runtimeSelection),
  };
}

function configRecord(environment: SessionEnvironmentOption): Record<string, unknown> {
  const config = environment.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  return config as Record<string, unknown>;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function EnvironmentLabel({ environment }: { environment?: SessionEnvironmentOption }) {
  if (!environment) return <CloudLabel />;
  const Icon = environment.adapterType === "local" ? Monitor : Cloud;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon size={12} className="shrink-0" />
      <span className="truncate">
        {environment.isDefault ? `Default: ${environment.name}` : environment.name}
      </span>
    </span>
  );
}

function CloudLabel() {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Cloud size={12} className="shrink-0 text-sky-400" />
      <span className="truncate">Cloud</span>
    </span>
  );
}
