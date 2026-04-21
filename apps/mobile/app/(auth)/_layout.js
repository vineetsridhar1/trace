"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AuthLayout;
var expo_router_1 = require("expo-router");
var client_core_1 = require("@trace/client-core");
function AuthLayout() {
    var user = (0, client_core_1.useAuthStore)(function (s) { return s.user; });
    if (user)
        return <expo_router_1.Redirect href="/"/>;
    return <expo_router_1.Stack screenOptions={{ headerShown: false }}/>;
}
