import { Alert } from "react-native";
import { gql } from "@urql/core";
import type { DesignSystem } from "@trace/gql";
import { createDesign } from "@/lib/createQuickSession";
import { getClient } from "@/lib/urql";

const DESIGN_SYSTEM_OPTIONS = gql`
  query MobileDesignSystemOptions($organizationId: ID!) {
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
    }
  }
`;
export async function chooseDesignSystemAndCreate(organizationId: string | null): Promise<void> {
  if (!organizationId) return;
  const result = await getClient()
    .query<{ designSystems: DesignSystem[] }>(DESIGN_SYSTEM_OPTIONS, { organizationId })
    .toPromise();
  if (result.error) {
    Alert.alert("Couldn't load design systems", result.error.message);
    return;
  }
  const systems = (result.data?.designSystems ?? []).filter(
    (system) => system.status === "ready" && !system.archivedAt && system.activeVersionId,
  );
  Alert.alert(
    "Create Design",
    "Choose a design system. The Design remains pinned to this version.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Trace Default", onPress: () => void createDesign() },
      ...systems.map((system) => ({
        text: `${system.name} · v${system.activeVersion?.version ?? "–"}`,
        onPress: () => void createDesign(system.activeVersionId ?? undefined),
      })),
    ],
  );
}
