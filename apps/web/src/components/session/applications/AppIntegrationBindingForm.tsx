import { useMemo, useState } from "react";
import type { IntegrationConnection, IntegrationExecutionIdentity } from "@trace/gql";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import type { AppIntegrationBindingDraft } from "./useAppIntegrationBindings";

const INITIAL_DRAFT: AppIntegrationBindingDraft = {
  label: "",
  provider: "",
  providerConfigKey: "",
  executionIdentity: "viewer",
  sharedConnectionId: null,
  allowedMethods: "GET",
  allowedPathPrefixes: "",
};

export function AppIntegrationBindingForm({
  connections,
  pending,
  onSave,
}: {
  connections: IntegrationConnection[];
  pending: boolean;
  onSave: (draft: AppIntegrationBindingDraft) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const eligibleConnections = useMemo(
    () =>
      connections.filter(
        (connection) =>
          connection.status === "active" &&
          connection.providerConfigKey === draft.providerConfigKey &&
          connection.kind === (draft.executionIdentity === "service" ? "service" : "personal"),
      ),
    [connections, draft.executionIdentity, draft.providerConfigKey],
  );
  const requiresConnection = draft.executionIdentity !== "viewer";
  const canSave = Boolean(
    draft.label.trim() &&
    draft.provider.trim() &&
    draft.providerConfigKey.trim() &&
    draft.allowedMethods.trim() &&
    draft.allowedPathPrefixes.trim() &&
    (!requiresConnection || draft.sharedConnectionId),
  );

  return (
    <div className="space-y-2 rounded-md border border-border bg-background/30 p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={draft.label}
          placeholder="Label"
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
        />
        <Input
          value={draft.provider}
          placeholder="Provider, e.g. GitHub"
          onChange={(event) => setDraft({ ...draft, provider: event.target.value })}
        />
      </div>
      <Input
        value={draft.providerConfigKey}
        placeholder="Nango integration key"
        onChange={(event) =>
          setDraft({ ...draft, providerConfigKey: event.target.value, sharedConnectionId: null })
        }
      />
      <Select
        value={draft.executionIdentity}
        onValueChange={(value) =>
          setDraft({
            ...draft,
            executionIdentity: value as IntegrationExecutionIdentity,
            sharedConnectionId: null,
          })
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="viewer">Each viewer’s permissions</SelectItem>
          <SelectItem value="shared">Shared personal connection</SelectItem>
          <SelectItem value="service">Service connection</SelectItem>
        </SelectContent>
      </Select>
      {requiresConnection ? (
        <Select
          value={draft.sharedConnectionId ?? ""}
          onValueChange={(value) => setDraft({ ...draft, sharedConnectionId: value || null })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select connection" />
          </SelectTrigger>
          <SelectContent>
            {eligibleConnections.map((connection) => (
              <SelectItem key={connection.id} value={connection.id}>
                {connection.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={draft.allowedMethods}
          placeholder="Methods: GET, POST"
          onChange={(event) => setDraft({ ...draft, allowedMethods: event.target.value })}
        />
        <Input
          value={draft.allowedPathPrefixes}
          placeholder="Paths: /api/data"
          onChange={(event) => setDraft({ ...draft, allowedPathPrefixes: event.target.value })}
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={pending || !canSave}
          onClick={() => void onSave(draft).then((saved) => saved && setDraft(INITIAL_DRAFT))}
        >
          Add data access
        </Button>
      </div>
    </div>
  );
}
