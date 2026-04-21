"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DevLayout;
var expo_router_1 = require("expo-router");
function DevLayout() {
    if (!__DEV__)
        return <expo_router_1.Redirect href="/(authed)"/>;
    return (<expo_router_1.Stack screenOptions={{ headerShown: false }}>
      <expo_router_1.Stack.Screen name="design-system"/>
      <expo_router_1.Stack.Screen name="sheet-preview" options={{ presentation: "formSheet" }}/>
    </expo_router_1.Stack>);
}
