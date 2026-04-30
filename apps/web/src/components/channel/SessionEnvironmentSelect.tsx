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

interface SessionEnvironmentsQueryResult {
  agentEnvironments?: SessionEnvironmentOption[];
}

type Props = {
  tool: string;
  selectedEnvironmentId: string | null;
  onSelectionChange: (environmentId: string | null) => void;
};

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
  selectedEnvironmentId,
  onSelectionChange,
}: Props) {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const [environments, setEnvironments] = useState<SessionEnvironmentOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!activeOrgId) {
      setEnvironments([]);
      onSelectionChange(null);
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
        onSelectionChange(resolveSelectedEnvironmentId(enabled, selectedEnvironmentId));
      })
      .catch(() => {
        if (!cancelled) {
          setEnvironments([]);
          onSelectionChange(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, onSelectionChange, selectedEnvironmentId, tool]);

  if (environments.length === 0) return null;

  const selectedEnvironment = environments.find(
    (environment) => environment.id === selectedEnvironmentId,
  );

  return (
    <Select value={selectedEnvironmentId ?? ""} onValueChange={onSelectionChange}>
      <SelectTrigger className="h-7 w-auto max-w-48 gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
        <SelectValue>
          <EnvironmentLabel environment={selectedEnvironment} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {environments.map((environment) => (
          <SelectItem key={environment.id} value={environment.id}>
            <EnvironmentLabel environment={environment} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function resolveSelectedEnvironmentId(
  environments: SessionEnvironmentOption[],
  current: string | null,
): string | null {
  if (current && environments.some((environment) => environment.id === current)) return current;
  return environments.find((environment) => environment.isDefault)?.id ?? environments[0]?.id ?? null;
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

function EnvironmentLabel({ environment }: { environment?: SessionEnvironmentOption }) {
  if (!environment) return <span>Org default</span>;
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
