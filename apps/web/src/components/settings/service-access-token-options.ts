import type { ServiceApiScope } from "@trace/gql";

export const AVAILABLE_SERVICE_SCOPES: Array<{
  id: ServiceApiScope;
  label: string;
  description: string;
}> = [
  {
    id: "sessions_start",
    label: "Start sessions",
    description: "Create new cloud-hosted sessions.",
  },
  {
    id: "sessions_status_read",
    label: "Read session status",
    description: "Poll the minimal status of sessions in this organization.",
  },
];

export const SERVICE_SCOPE_LABELS: Record<ServiceApiScope, string> = Object.fromEntries(
  AVAILABLE_SERVICE_SCOPES.map((scope) => [scope.id, scope.label]),
) as Record<ServiceApiScope, string>;
