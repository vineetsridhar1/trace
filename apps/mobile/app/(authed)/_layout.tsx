import type { ComponentProps } from "react";
import { Redirect, withLayoutContext } from "expo-router";
import {
  createNativeBottomTabNavigator,
  type NativeBottomTabNavigationEventMap,
  type NativeBottomTabNavigationOptions,
} from "@bottom-tabs/react-navigation";
import type {
  ParamListBase,
  TabNavigationState,
} from "@react-navigation/native";
import {
  useAuthStore,
  useEntityStore,
  type AuthState,
  type EntityState,
} from "@trace/client-core";
import { useHydrate } from "@/hooks/useHydrate";
import { FakeSessionAccessory } from "@/components/navigation/FakeSessionAccessory";

const BottomTabNavigator = createNativeBottomTabNavigator().Navigator;
const NativeTabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof BottomTabNavigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(BottomTabNavigator);

type ScreenProps = ComponentProps<typeof NativeTabs.Screen>;

function selectNeedsInputCount(state: EntityState): number {
  let count = 0;
  for (const id in state.sessions) {
    if (state.sessions[id].sessionStatus === "needs_input") count++;
  }
  return count;
}

const homeIcon: NonNullable<NativeBottomTabNavigationOptions["tabBarIcon"]> = () => ({
  sfSymbol: "bolt.horizontal",
});
const channelsIcon: NonNullable<NativeBottomTabNavigationOptions["tabBarIcon"]> = () => ({
  sfSymbol: "tray",
});
const settingsIcon: NonNullable<NativeBottomTabNavigationOptions["tabBarIcon"]> = () => ({
  sfSymbol: "gearshape",
});
const hidden: ScreenProps["options"] = { tabBarItemHidden: true };

export default function AuthedLayout() {
  const user = useAuthStore((s: AuthState) => s.user);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  useHydrate(activeOrgId);

  const needsInputCount = useEntityStore(selectNeedsInputCount);

  if (!user) return <Redirect href="/(auth)/sign-in" />;

  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      renderBottomAccessoryView={() => <FakeSessionAccessory />}
    >
      <NativeTabs.Screen
        name="(home)"
        options={{
          title: "Home",
          tabBarIcon: homeIcon,
          tabBarBadge: needsInputCount > 0 ? String(needsInputCount) : undefined,
        }}
      />
      <NativeTabs.Screen
        name="channels"
        options={{ title: "Channels", tabBarIcon: channelsIcon }}
      />
      <NativeTabs.Screen
        name="(settings)"
        options={{ title: "Settings", tabBarIcon: settingsIcon }}
      />
      <NativeTabs.Screen name="sessions" options={hidden} />
      <NativeTabs.Screen name="sheets" options={hidden} />
    </NativeTabs>
  );
}
