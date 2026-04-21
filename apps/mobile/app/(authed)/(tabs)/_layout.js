"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TabsLayout;
var expo_router_1 = require("expo-router");
var react_navigation_1 = require("@bottom-tabs/react-navigation");
var client_core_1 = require("@trace/client-core");
var ActiveSessionsAccessory_1 = require("@/components/navigation/ActiveSessionsAccessory");
var BottomTabNavigator = (0, react_navigation_1.createNativeBottomTabNavigator)().Navigator;
var NativeTabs = (0, expo_router_1.withLayoutContext)(BottomTabNavigator);
function selectNeedsInputCount(state) {
    var count = 0;
    for (var id in state.sessions) {
        if (state.sessions[id].sessionStatus === "needs_input")
            count++;
    }
    return count;
}
var renderAccessory = function () { return <ActiveSessionsAccessory_1.ActiveSessionsAccessory />; };
var homeIcon = function () { return ({
    sfSymbol: "bolt.horizontal",
}); };
var channelsIcon = function () { return ({
    sfSymbol: "tray",
}); };
var settingsIcon = function () { return ({
    sfSymbol: "gearshape",
}); };
function TabsLayout() {
    var needsInputCount = (0, client_core_1.useEntityStore)(selectNeedsInputCount);
    return (<NativeTabs minimizeBehavior="onScrollDown" renderBottomAccessoryView={renderAccessory}>
      <NativeTabs.Screen name="(home)" options={{
            title: "Home",
            tabBarIcon: homeIcon,
            tabBarBadge: needsInputCount > 0 ? String(needsInputCount) : undefined,
        }}/>
      <NativeTabs.Screen name="channels" options={{ title: "Channels", tabBarIcon: channelsIcon }}/>
      <NativeTabs.Screen name="(settings)" options={{ title: "Settings", tabBarIcon: settingsIcon }}/>
    </NativeTabs>);
}
