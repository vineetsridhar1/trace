import { withLayoutContext } from "expo-router";
import {
  createNativeBottomTabNavigator,
  type NativeBottomTabNavigationEventMap,
  type NativeBottomTabNavigationOptions,
} from "@bottom-tabs/react-navigation";
import type {
  ParamListBase,
  TabNavigationState,
} from "@react-navigation/native";
import { useEntityStore, type EntityState } from "@trace/client-core";
import { ActiveSessionsAccessory } from "@/components/navigation/ActiveSessionsAccessory";

const BottomTabNavigator = createNativeBottomTabNavigator().Navigator;
const NativeTabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof BottomTabNavigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(BottomTabNavigator);

function selectNeedsInputCount(state: EntityState): number {
  let count = 0;
  for (const id in state.sessions) {
    if (state.sessions[id].sessionStatus === "needs_input") count++;
  }
  return count;
}

const renderAccessory = () => <ActiveSessionsAccessory />;

export const unstable_settings = {
  initialRouteName: "(home)",
};

const homeIcon: NonNullable<NativeBottomTabNavigationOptions["tabBarIcon"]> = () => ({
  sfSymbol: "house",
});
const channelsIcon: NonNullable<NativeBottomTabNavigationOptions["tabBarIcon"]> = () => ({
  sfSymbol: "tray",
});
const connectionsIcon: NonNullable<NativeBottomTabNavigationOptions["tabBarIcon"]> = () => ({
  sfSymbol: "laptopcomputer.and.iphone",
});

export default function TabsLayout() {
  const needsInputCount = useEntityStore(selectNeedsInputCount);

  return (
    <NativeTabs
      // Pin Home as the default tab. expo-router picks the alphabetically
      // first route otherwise, and `(connections)` sorts before `(home)`.
      initialRouteName="(home)"
      minimizeBehavior="onScrollDown"
      renderBottomAccessoryView={renderAccessory}
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
        name="(connections)"
        options={{ title: "Connections", tabBarIcon: connectionsIcon }}
      />
    </NativeTabs>
  );
}
