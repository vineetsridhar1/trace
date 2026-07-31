import { useEffect, useMemo } from "react";
import { gql } from "@urql/core";
import type { DesignSystem } from "@trace/gql";
import { useAuthStore, useEntityStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { useCommandPaletteStore } from "../../stores/command-palette";
import {
  CREATE_DESIGN_SYSTEM,
  DesignSystemCombobox,
  TRACE_DEFAULT_DESIGN_SYSTEM,
} from "../design-system/DesignSystemCombobox";

const HOME_DESIGN_SYSTEMS_QUERY = gql`
  query HomeComposerDesignSystems($organizationId: ID!) {
    designSystems(organizationId: $organizationId) {
      id
      name
      status
      archivedAt
      activeVersionId
      activeVersion {
        id
        version
      }
      sourceRepo {
        id
        name
      }
    }
  }
`;

export function HomeDesignSystemPicker({
  selectedVersionId,
  disabled,
  onSelect,
}: {
  selectedVersionId: string | null;
  disabled: boolean;
  onSelect: (versionId: string | null) => void;
}) {
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const systemsById = useEntityStore((state) => state.designSystems);
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const openGeneratedProjectDialog = useCommandPaletteStore(
    (state) => state.openGeneratedProjectDialog,
  );
  const systems = useMemo(() => Object.values(systemsById), [systemsById]);

  useEffect(() => {
    if (disabled || !activeOrgId) return;
    let active = true;
    void client
      .query(
        HOME_DESIGN_SYSTEMS_QUERY,
        { organizationId: activeOrgId },
        { requestPolicy: "cache-and-network" },
      )
      .toPromise()
      .then((result) => {
        if (!active || result.error) return;
        upsertMany("designSystems", (result.data?.designSystems ?? []) as DesignSystem[]);
      });
    return () => {
      active = false;
    };
  }, [activeOrgId, disabled, upsertMany]);

  if (disabled) return null;

  return (
    <DesignSystemCombobox
      systems={systems}
      value={selectedVersionId ?? TRACE_DEFAULT_DESIGN_SYSTEM}
      onValueChange={(value) => {
        if (value === CREATE_DESIGN_SYSTEM) {
          openGeneratedProjectDialog("design-system");
          return;
        }
        onSelect(value === TRACE_DEFAULT_DESIGN_SYSTEM ? null : value);
      }}
    />
  );
}
