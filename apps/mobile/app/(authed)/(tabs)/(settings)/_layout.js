"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SettingsLayout;
var expo_router_1 = require("expo-router");
var client_core_1 = require("@trace/client-core");
var TopBarPill_1 = require("@/components/navigation/TopBarPill");
function SettingsLayout() {
    var user = (0, client_core_1.useAuthStore)(function (s) { return s.user; });
    return (<expo_router_1.Stack>
      <expo_router_1.Stack.Screen name="index" options={{
            title: "Settings",
            headerLargeTitle: true,
            headerLargeTitleShadowVisible: false,
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
    </expo_router_1.Stack>);
}
