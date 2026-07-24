import { useCallback, useEffect, useState } from "react";
import type { ServiceAccessToken } from "@trace/gql";
import { useAuthStore, useEntityIds, useEntityStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import { CreateServiceAccessTokenDialog } from "./CreateServiceAccessTokenDialog";
import { ServiceAccessTokenRow } from "./ServiceAccessTokenRow";
import {
  REVOKE_SERVICE_ACCESS_TOKEN,
  SERVICE_ACCESS_TOKENS_QUERY,
} from "./service-access-token-queries";

const sortNewestFirst = (left: ServiceAccessToken, right: ServiceAccessToken) =>
  new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();

export function ServiceAccessTokensSection() {
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const filterForActiveOrg = useCallback(
    (token: ServiceAccessToken) => token.organizationId === activeOrgId,
    [activeOrgId],
  );
  const tokenIds = useEntityIds("serviceAccessTokens", filterForActiveOrg, sortNewestFirst);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    if (!activeOrgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await client
      .query(SERVICE_ACCESS_TOKENS_QUERY, { organizationId: activeOrgId })
      .toPromise();
    if (result.error) {
      setError(result.error.message);
    } else {
      const tokens = (result.data?.serviceAccessTokens ?? []) as ServiceAccessToken[];
      upsertMany("serviceAccessTokens", tokens);
    }
    setLoading(false);
  }, [activeOrgId, upsertMany]);

  useEffect(() => {
    void fetchTokens();
  }, [fetchTokens]);

  async function revokeToken(id: string) {
    if (
      !window.confirm(
        "Revoke this service token? Existing deployments will lose access immediately.",
      )
    ) {
      return;
    }
    setPendingRevokeId(id);
    setError(null);
    const result = await client.mutation(REVOKE_SERVICE_ACCESS_TOKEN, { id }).toPromise();
    if (result.error) setError(result.error.message);
    setPendingRevokeId(null);
  }

  if (!activeOrgId) {
    return <p className="text-sm text-muted-foreground">Select an organization first.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Service Tokens</h2>
          <p className="text-sm text-muted-foreground">
            Revocable credentials for internal services. Secrets are shown only once.
          </p>
        </div>
        <CreateServiceAccessTokenDialog organizationId={activeOrgId} />
      </div>

      {error ? (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span>{error}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => void fetchTokens()}>
            Retry
          </Button>
        </div>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading service tokens…</p>
      ) : tokenIds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-foreground">No service tokens</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create one when an internal daemon needs limited Trace access.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tokenIds.map((id) => (
            <ServiceAccessTokenRow
              key={id}
              id={id}
              pending={pendingRevokeId === id}
              onRevoke={(tokenId) => void revokeToken(tokenId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
