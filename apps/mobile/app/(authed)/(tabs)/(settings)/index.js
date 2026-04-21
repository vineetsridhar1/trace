"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SettingsScreen;
var expo_constants_1 = require("expo-constants");
var expo_router_1 = require("expo-router");
var react_native_1 = require("react-native");
var client_core_1 = require("@trace/client-core");
var design_system_1 = require("@/components/design-system");
var urql_1 = require("@/lib/urql");
var ui_1 = require("@/stores/ui");
var theme_1 = require("@/theme");
var APP_VERSION = (_b = (_a = expo_constants_1.default.expoConfig) === null || _a === void 0 ? void 0 : _a.version) !== null && _b !== void 0 ? _b : "0.0.1";
var BUILD_NUMBER = (_c = expo_constants_1.default.nativeBuildVersion) !== null && _c !== void 0 ? _c : "dev";
function SettingsScreen() {
    var _a, _b, _c, _d;
    var router = (0, expo_router_1.useRouter)();
    var theme = (0, theme_1.useTheme)();
    var user = (0, client_core_1.useAuthStore)(function (s) { return s.user; });
    var activeOrgId = (0, client_core_1.useAuthStore)(function (s) { return s.activeOrgId; });
    var memberships = (0, client_core_1.useAuthStore)(function (s) { return s.orgMemberships; });
    var logout = (0, client_core_1.useAuthStore)(function (s) { return s.logout; });
    var activeOrg = memberships.find(function (membership) { return membership.organizationId === activeOrgId; });
    var userName = (_b = (_a = user === null || user === void 0 ? void 0 : user.name) !== null && _a !== void 0 ? _a : user === null || user === void 0 ? void 0 : user.email) !== null && _b !== void 0 ? _b : "Trace user";
    var userEmail = (_c = user === null || user === void 0 ? void 0 : user.email) !== null && _c !== void 0 ? _c : "Signed in";
    function openOrgSwitcher() {
        router.push("/sheets/org-switcher");
    }
    function confirmSignOut() {
        react_native_1.Alert.alert("Sign out", "You will need to sign in again on this device.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Sign out",
                style: "destructive",
                onPress: function () {
                    void handleSignOut();
                },
            },
        ]);
    }
    // Do mobile-only cleanup first, while this component is still mounted —
    // `await logout()` sets user=null which immediately triggers `<Redirect>`
    // in `AuthedLayout`. The entity store reset lives inside `logout()` itself.
    function handleSignOut() {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ui_1.useMobileUIStore.getState().reset();
                        (0, urql_1.recreateClient)();
                        return [4 /*yield*/, logout()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    }
    return (<design_system_1.Screen edges={["left", "right"]}>
      <react_native_1.ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[
            styles.content,
            { padding: theme.spacing.lg },
        ]}>
        <react_native_1.View style={[
            styles.section,
            {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.borderMuted,
                borderRadius: theme.radius.lg,
            },
        ]}>
          <design_system_1.ListRow title={userName} subtitle={userEmail} leading={<design_system_1.Avatar name={userName} uri={user === null || user === void 0 ? void 0 : user.avatarUrl} size="lg"/>} separator={false}/>
        </react_native_1.View>

        <react_native_1.View style={[
            styles.section,
            {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.borderMuted,
                borderRadius: theme.radius.lg,
            },
        ]}>
          <design_system_1.ListRow title="Active organization" subtitle={(_d = activeOrg === null || activeOrg === void 0 ? void 0 : activeOrg.organization.name) !== null && _d !== void 0 ? _d : "No active organization"} disclosureIndicator onPress={openOrgSwitcher} 
    // Hide the bottom separator when the dev row below isn't rendered.
    separator={__DEV__}/>
          {__DEV__ ? (<design_system_1.ListRow title="Design System" subtitle="Developer preview" disclosureIndicator onPress={function () { return router.push("/(dev)/design-system"); }} separator={false}/>) : null}
        </react_native_1.View>

        <react_native_1.View style={[
            styles.section,
            {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.borderMuted,
                borderRadius: theme.radius.lg,
            },
        ]}>
          <design_system_1.ListRow title="Sign out" destructive onPress={confirmSignOut} separator={false}/>
        </react_native_1.View>

        <design_system_1.Text variant="caption1" color="dimForeground" align="center">
          Version {APP_VERSION} ({BUILD_NUMBER})
        </design_system_1.Text>
      </react_native_1.ScrollView>
    </design_system_1.Screen>);
}
var styles = react_native_1.StyleSheet.create({
    content: {
        gap: 16,
        paddingBottom: 32,
    },
    section: {
        overflow: "hidden",
        borderWidth: react_native_1.StyleSheet.hairlineWidth,
    },
});
