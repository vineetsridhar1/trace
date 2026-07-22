import { useAuthStore, useEntityStore } from "@trace/client-core";
import { useOnboardingStore } from "../stores/onboarding";
import { useUIStore } from "../stores/ui";
import { recreateClient } from "./urql";
import { blockNavigation } from "./navigation-blocker";

export function switchActiveOrganization(orgId: string) {
  const auth = useAuthStore.getState();
  if (auth.activeOrgId === orgId) return;
  if (blockNavigation(() => switchActiveOrganization(orgId))) return;

  useEntityStore.getState().reset();
  useUIStore.getState().resetForOrgSwitch();
  useOnboardingStore.getState().reset();
  auth.setActiveOrg(orgId);
  recreateClient();
}
