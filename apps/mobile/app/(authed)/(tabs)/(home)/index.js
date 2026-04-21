"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AuthedHome;
var react_native_1 = require("react-native");
var expo_router_1 = require("expo-router");
var client_core_1 = require("@trace/client-core");
function AuthedHome() {
    var _a;
    var router = (0, expo_router_1.useRouter)();
    var user = (0, client_core_1.useAuthStore)(function (s) { return s.user; });
    var activeOrgId = (0, client_core_1.useAuthStore)(function (s) { return s.activeOrgId; });
    var memberships = (0, client_core_1.useAuthStore)(function (s) { return s.orgMemberships; });
    var channelIds = (0, client_core_1.useEntityIds)("channels");
    var sessionIds = (0, client_core_1.useEntityIds)("sessions");
    var activeOrg = memberships.find(function (m) { return m.organizationId === activeOrgId; });
    return (<react_native_1.ScrollView style={styles.scroll} contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
      <react_native_1.Text style={styles.heading}>Trace Mobile</react_native_1.Text>
      {user && <react_native_1.Text style={styles.subtle}>Signed in as {user.name}</react_native_1.Text>}
      <react_native_1.Text style={styles.subtle}>{(_a = activeOrg === null || activeOrg === void 0 ? void 0 : activeOrg.organization.name) !== null && _a !== void 0 ? _a : "No org"}</react_native_1.Text>

      <react_native_1.View style={styles.stats}>
        <react_native_1.Text style={styles.stat}>Channels: {channelIds.length}</react_native_1.Text>
        <react_native_1.Text style={styles.stat}>Sessions: {sessionIds.length}</react_native_1.Text>
      </react_native_1.View>

      {__DEV__ && (<react_native_1.Pressable accessibilityRole="button" onPress={function () { return router.push("/(dev)/design-system"); }} style={function (_a) {
            var pressed = _a.pressed;
            return [styles.devButton, pressed && styles.pressed];
        }}>
          <react_native_1.Text style={styles.devButtonText}>Design System</react_native_1.Text>
        </react_native_1.Pressable>)}

      {Array.from({ length: 30 }).map(function (_, i) { return (<react_native_1.View key={i} style={styles.filler}>
          <react_native_1.Text style={styles.fillerText}>Scroll filler row {i + 1}</react_native_1.Text>
        </react_native_1.View>); })}
    </react_native_1.ScrollView>);
}
var styles = react_native_1.StyleSheet.create({
    scroll: {
        flex: 1,
        backgroundColor: "#000",
    },
    container: {
        alignItems: "center",
        gap: 16,
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 160,
    },
    filler: {
        alignSelf: "stretch",
        paddingVertical: 16,
        paddingHorizontal: 12,
        borderBottomWidth: react_native_1.StyleSheet.hairlineWidth,
        borderBottomColor: "#222",
    },
    fillerText: {
        color: "#888",
        fontSize: 14,
    },
    heading: {
        color: "#fff",
        fontSize: 22,
        fontWeight: "600",
    },
    subtle: {
        color: "#888",
        fontSize: 14,
    },
    pressed: {
        opacity: 0.7,
    },
    stats: {
        alignItems: "center",
        gap: 4,
        marginTop: 12,
    },
    stat: {
        color: "#666",
        fontSize: 13,
    },
    devButton: {
        marginTop: 24,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#333",
    },
    devButtonText: {
        color: "#888",
        fontSize: 12,
        fontFamily: "Menlo",
    },
});
