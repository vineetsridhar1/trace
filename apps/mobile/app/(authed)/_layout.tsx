import { useMemo } from "react";
import { Redirect, Tabs } from "expo-router";
import {
  useAuthStore,
  useEntityIds,
  type AuthState,
  type SessionEntity,
} from "@trace/client-core";
import { useHydrate } from "@/hooks/useHydrate";
import { TabBar, type TabDef } from "@/components/navigation/TabBar";

export default function AuthedLayout() {
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  useHydrate(activeOrgId);

  const needsInputIds = useEntityIds(
    "sessions",
    (s: SessionEntity) => s.sessionStatus === "needs_input",
  );

  const tabs = useMemo<TabDef[]>(
    () => [
      { name: "index", label: "Home", symbol: "bolt.horizontal", badge: needsInputIds.length },
      { name: "channels", label: "Channels", symbol: "tray" },
      { name: "settings", label: "Settings", symbol: "gearshape" },
    ],
    [needsInputIds.length],
  );

  if (!user) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} tabs={tabs} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="channels" options={{ title: "Channels" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      <Tabs.Screen name="sessions" options={{ href: null }} />
      <Tabs.Screen name="sheets" options={{ href: null }} />
    </Tabs>
  );
}
