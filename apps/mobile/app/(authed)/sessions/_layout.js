"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SessionsLayout;
var expo_router_1 = require("expo-router");
function SessionsLayout() {
    return (<expo_router_1.Stack>
      <expo_router_1.Stack.Screen name="[groupId]" options={{
            title: "Session Group",
            headerBackTitle: "Back",
        }}/>
      <expo_router_1.Stack.Screen name="[groupId]/[sessionId]" options={{
            title: "Session",
            headerBackTitle: "Back",
        }}/>
    </expo_router_1.Stack>);
}
