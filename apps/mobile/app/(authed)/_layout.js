"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AuthedLayout;
var react_native_1 = require("react-native");
var expo_router_1 = require("expo-router");
var client_core_1 = require("@trace/client-core");
var SessionPlayerOverlay_1 = require("@/components/navigation/SessionPlayerOverlay");
var useHydrate_1 = require("@/hooks/useHydrate");
function AuthedLayout() {
    var user = (0, client_core_1.useAuthStore)(function (s) { return s.user; });
    var activeOrgId = (0, client_core_1.useAuthStore)(function (s) { return s.activeOrgId; });
    (0, useHydrate_1.useHydrate)(activeOrgId);
    if (!user)
        return <expo_router_1.Redirect href="/(auth)/sign-in"/>;
    return (<react_native_1.View style={{ flex: 1 }}>
      <expo_router_1.Stack screenOptions={{ headerShown: false }}>
        <expo_router_1.Stack.Screen name="(tabs)" options={{ headerShown: false }}/>
        <expo_router_1.Stack.Screen name="sessions" options={{ headerShown: false }}/>
      </expo_router_1.Stack>
      <SessionPlayerOverlay_1.SessionPlayerOverlay />
    </react_native_1.View>);
}
