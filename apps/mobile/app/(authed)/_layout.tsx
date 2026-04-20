import { useMemo } from "react";
import { Redirect, Tabs } from "expo-router";
import {
  useAuthStore,
  useEntityStore,
  type AuthState,
  type EntityState,
} from "@trace/client-core";
import { useHydrate } from "@/hooks/useHydrate";
import { TabBar, type TabDef } from "@/components/navigation/TabBar";

function selectNeedsInputCount(state: EntityState): number {
  let count = 0;
  for (const id in state.sessions) {
    if (state.sessions[id].sessionStatus === "needs_input") count++;
  }
  return count;
}

export default function AuthedLayout() {
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  useHydrate(activeOrgId);

  const needsInputCount = useEntityStore(selectNeedsInputCount);

  const tabs = useMemo<TabDef[]>(
    () => [
      { name: "(home)", label: "Home", symbol: "bolt.horizontal", badge: needsInputCount },
      { name: "channels", label: "Channels", symbol: "tray" },
      { name: "(settings)", label: "Settings", symbol: "gearshape" },
    ],
    [needsInputCount],
  );

  if (!user) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
      tabBar={(props) => <TabBar {...props} tabs={tabs} />}
    >
      <Tabs.Screen name="(home)" options={{ title: "Home" }} />
      <Tabs.Screen name="channels" options={{ title: "Channels" }} />
      <Tabs.Screen name="(settings)" options={{ title: "Settings" }} />
      <Tabs.Screen name="sessions" options={{ href: null }} />
      <Tabs.Screen name="sheets" options={{ href: null }} />
    </Tabs>
  );
}
