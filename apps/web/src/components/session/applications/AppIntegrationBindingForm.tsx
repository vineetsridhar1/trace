import { useState } from "react";
import type { IntegrationConnection, SupportedAppIntegration } from "@trace/gql";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { AppIntegrationCapabilityPicker } from "./AppIntegrationCapabilityPicker";
import { AppIntegrationIdentityPicker } from "./AppIntegrationIdentityPicker";
import type { AppIntegrationBindingDraft } from "./useAppIntegrationBindings";

const INITIAL_DRAFT: AppIntegrationBindingDraft = {
  integrationId: "",
  capabilityIds: [],
  executionIdentity: "viewer",
  sharedConnectionId: null,
};

export function AppIntegrationBindingForm({
  connections,
  existingProviderConfigKeys,
  integrations,
  pending,
  onSave,
}: {
  connections: IntegrationConnection[];
  existingProviderConfigKeys: string[];
  integrations: SupportedAppIntegration[];
  pending: boolean;
  onSave: (draft: AppIntegrationBindingDraft) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const integration = integrations.find((candidate) => candidate.id === draft.integrationId);
  const requiresConnection = draft.executionIdentity !== "viewer";
  const canSave = Boolean(
    integration &&
    draft.capabilityIds.length > 0 &&
    (!requiresConnection || draft.sharedConnectionId),
  );

  const selectIntegration = (integrationId: string | null) => {
    if (!integrationId) return;
    const selected = integrations.find((candidate) => candidate.id === integrationId);
    setDraft({
      ...INITIAL_DRAFT,
      integrationId,
      capabilityIds: selected?.capabilities[0] ? [selected.capabilities[0].id] : [],
    });
  };

  const toggleCapability = (capabilityId: string) => {
    setDraft((current) => ({
      ...current,
      capabilityIds: current.capabilityIds.includes(capabilityId)
        ? current.capabilityIds.filter((id) => id !== capabilityId)
        : [...current.capabilityIds, capabilityId],
    }));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/30 p-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-foreground">Integration</p>
        <Select value={draft.integrationId} onValueChange={selectIntegration}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose an integration" />
          </SelectTrigger>
          <SelectContent>
            {integrations.map((candidate) => (
              <SelectItem
                key={candidate.id}
                value={candidate.id}
                disabled={existingProviderConfigKeys.includes(candidate.providerConfigKey)}
              >
                {candidate.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {integration ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">{integration.description}</p>
        ) : null}
      </div>

      {integration ? (
        <AppIntegrationCapabilityPicker
          integration={integration}
          selectedIds={draft.capabilityIds}
          onToggle={toggleCapability}
        />
      ) : null}

      {integration ? (
        <AppIntegrationIdentityPicker
          connections={connections}
          integration={integration}
          identity={draft.executionIdentity}
          sharedConnectionId={draft.sharedConnectionId}
          onIdentityChange={(executionIdentity) =>
            setDraft({ ...draft, executionIdentity, sharedConnectionId: null })
          }
          onConnectionChange={(sharedConnectionId) => setDraft({ ...draft, sharedConnectionId })}
        />
      ) : null}

      <Button
        className="w-full"
        size="sm"
        disabled={pending || !canSave}
        onClick={() => void onSave(draft).then((saved) => saved && setDraft(INITIAL_DRAFT))}
      >
        Add integration
      </Button>
    </div>
  );
}
