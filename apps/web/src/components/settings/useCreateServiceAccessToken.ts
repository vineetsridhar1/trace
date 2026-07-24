import { useState } from "react";
import type { ServiceApiScope } from "@trace/gql";
import { client } from "../../lib/urql";
import { AVAILABLE_SERVICE_SCOPES } from "./service-access-token-options";
import { CREATE_SERVICE_ACCESS_TOKEN } from "./service-access-token-queries";

export function useCreateServiceAccessToken(organizationId: string) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [expirationDays, setExpirationDays] = useState("90");
  const [scopes, setScopes] = useState<ServiceApiScope[]>(
    AVAILABLE_SERVICE_SCOPES.map((scope) => scope.id),
  );
  const [creating, setCreating] = useState(false);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setExpirationDays("90");
    setScopes(AVAILABLE_SERVICE_SCOPES.map((scope) => scope.id));
    setRawToken(null);
    setCopied(false);
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function toggleScope(scope: ServiceApiScope) {
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  }

  async function createToken() {
    if (!name.trim() || scopes.length === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const expiresAt = new Date(
        Date.now() + Number(expirationDays) * 24 * 60 * 60 * 1000,
      ).toISOString();
      const result = await client
        .mutation(CREATE_SERVICE_ACCESS_TOKEN, {
          input: { organizationId, name: name.trim(), scopes, expiresAt },
        })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      const token = result.data?.createServiceAccessToken?.token;
      if (typeof token !== "string") throw new Error("The token was created without a secret");
      setRawToken(token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create service token");
    } finally {
      setCreating(false);
    }
  }

  async function copyToken() {
    if (!rawToken) return;
    await navigator.clipboard.writeText(rawToken);
    setCopied(true);
  }

  return {
    open,
    name,
    expirationDays,
    scopes,
    creating,
    rawToken,
    copied,
    error,
    setName,
    setExpirationDays,
    handleOpenChange,
    toggleScope,
    createToken,
    copyToken,
  };
}
