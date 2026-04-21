"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SessionGroupRedirectScreen;
var react_1 = require("react");
var expo_router_1 = require("expo-router");
var react_native_1 = require("react-native");
var design_system_1 = require("@/components/design-system");
var useChannelSessionGroups_1 = require("@/hooks/useChannelSessionGroups");
var useSessionGroupDetail_1 = require("@/hooks/useSessionGroupDetail");
var theme_1 = require("@/theme");
function SessionGroupRedirectScreen() {
    var groupId = (0, expo_router_1.useLocalSearchParams)().groupId;
    var router = (0, expo_router_1.useRouter)();
    var theme = (0, theme_1.useTheme)();
    var loading = (0, useSessionGroupDetail_1.useEnsureSessionGroupDetail)(groupId);
    var latestSessionId = (0, useChannelSessionGroups_1.useLatestSessionIdForGroup)(groupId);
    (0, react_1.useEffect)(function () {
        if (!groupId || !latestSessionId)
            return;
        router.replace("/sessions/".concat(groupId, "/").concat(latestSessionId));
    }, [groupId, latestSessionId, router]);
    return (<>
      <expo_router_1.Stack.Screen options={{ title: "Session Group" }}/>
      <react_native_1.View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        {loading || latestSessionId ? (<design_system_1.Spinner size="small" color="mutedForeground"/>) : (<design_system_1.EmptyState icon="bolt.horizontal" title="No sessions in this group" subtitle="This workspace has not started a session yet."/>)}
      </react_native_1.View>
    </>);
}
var styles = react_native_1.StyleSheet.create({
    root: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
    },
});
