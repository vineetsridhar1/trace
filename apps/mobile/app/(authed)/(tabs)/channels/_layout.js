"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ChannelsLayout;
var expo_router_1 = require("expo-router");
var client_core_1 = require("@trace/client-core");
var TopBarPill_1 = require("@/components/navigation/TopBarPill");
var theme_1 = require("@/theme");
function ChannelsLayout() {
    var user = (0, client_core_1.useAuthStore)(function (s) { return s.user; });
    var theme = (0, theme_1.useTheme)();
    // Force the native nav bar to render with the app's dark palette so it
    // doesn't flash light-mode chrome over dark content.
    var screenOptions = {
        headerStyle: { backgroundColor: theme.colors.background },
        headerLargeStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.foreground,
        headerTitleStyle: { color: theme.colors.foreground },
        headerLargeTitleStyle: { color: theme.colors.foreground },
        headerShadowVisible: false,
    };
    return (<expo_router_1.Stack screenOptions={screenOptions}>
      <expo_router_1.Stack.Screen name="index" options={{
            title: "Channels",
            headerLargeTitle: true,
            headerLargeTitleShadowVisible: false,
            headerSearchBarOptions: {
                placeholder: "Search channels",
                // See channels/index.tsx — pull-to-reveal fights iOS 26 tab bar
                // minimize for the same scroll view. Keep the bar always visible
                // so the tab bar + bottom accessory collapse on scroll.
                hideWhenScrolling: false,
            },
            headerRight: function () {
                var _a, _b;
                return (<TopBarPill_1.TopBarPill avatar={user
                        ? {
                            name: (_b = (_a = user.name) !== null && _a !== void 0 ? _a : user.email) !== null && _b !== void 0 ? _b : "?",
                            uri: user.avatarUrl,
                            accessibilityLabel: "Account",
                        }
                        : undefined}/>);
            },
        }}/>
      <expo_router_1.Stack.Screen name="[id]" options={{
            title: "Channel",
            headerBackTitle: "Channels",
        }}/>
      <expo_router_1.Stack.Screen name="[id]/merged-archived" options={{
            title: "Merged & Archived",
            headerBackTitle: "Back",
        }}/>
    </expo_router_1.Stack>);
}
