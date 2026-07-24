import { ShieldCheck, Trash2 } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { Button } from "../ui/button";
import { SERVICE_SCOPE_LABELS } from "./service-access-token-options";

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ServiceAccessTokenRow({
  id,
  pending,
  onRevoke,
}: {
  id: string;
  pending: boolean;
  onRevoke: (id: string) => void;
}) {
  const name = useEntityField("serviceAccessTokens", id, "name");
  const tokenPrefix = useEntityField("serviceAccessTokens", id, "tokenPrefix");
  const scopes = useEntityField("serviceAccessTokens", id, "scopes") ?? [];
  const createdBy = useEntityField("serviceAccessTokens", id, "createdBy");
  const expiresAt = useEntityField("serviceAccessTokens", id, "expiresAt");
  const revokedAt = useEntityField("serviceAccessTokens", id, "revokedAt");
  const lastUsedAt = useEntityField("serviceAccessTokens", id, "lastUsedAt");
  const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
  const inactive = Boolean(revokedAt) || expired;

  return (
    <div className="rounded-lg border border-border bg-surface-deep p-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="shrink-0 text-muted-foreground" />
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            {inactive ? (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                {revokedAt ? "Revoked" : "Expired"}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-500">
                Active
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{tokenPrefix}…</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {scopes.map((scope) => (
              <span
                key={scope}
                className="rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs text-muted-foreground"
              >
                {SERVICE_SCOPE_LABELS[scope]}
              </span>
            ))}
          </div>
        </div>

        {!revokedAt ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => onRevoke(id)}
          >
            <Trash2 size={14} />
            {pending ? "Revoking…" : "Revoke"}
          </Button>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <dt>Created by</dt>
          <dd className="mt-0.5 text-foreground">{createdBy?.name ?? "Deleted user"}</dd>
        </div>
        <div>
          <dt>Last used</dt>
          <dd className="mt-0.5 text-foreground">{formatTimestamp(lastUsedAt)}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd className="mt-0.5 text-foreground">{formatTimestamp(expiresAt)}</dd>
        </div>
      </dl>
    </div>
  );
}
