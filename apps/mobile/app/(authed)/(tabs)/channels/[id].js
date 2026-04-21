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
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ChannelDetail;
var react_1 = require("react");
var expo_router_1 = require("expo-router");
var client_core_1 = require("@trace/client-core");
var react_native_1 = require("react-native");
var react_native_reanimated_1 = require("react-native-reanimated");
var design_system_1 = require("@/components/design-system");
var SessionGroupRow_1 = require("@/components/channels/SessionGroupRow");
var SessionGroupsHeader_1 = require("@/components/channels/SessionGroupsHeader");
var SessionGroupSectionHeader_1 = require("@/components/channels/SessionGroupSectionHeader");
var useChannelSessionGroups_1 = require("@/hooks/useChannelSessionGroups");
var useChannelSessionGroupsQuery_1 = require("@/hooks/useChannelSessionGroupsQuery");
var useHydrate_1 = require("@/hooks/useHydrate");
var haptics_1 = require("@/lib/haptics");
var theme_1 = require("@/theme");
// Mirror the web behavior where terminal/less-actionable sections start
// collapsed so the user lands on what still needs attention.
var DEFAULT_COLLAPSED = new Set([
    "failed",
    "stopped",
]);
// LayoutAnimation is opt-in on Android; iOS already has it enabled.
if (react_native_1.Platform.OS === "android"
    && react_native_1.UIManager.setLayoutAnimationEnabledExperimental) {
    react_native_1.UIManager.setLayoutAnimationEnabledExperimental(true);
}
var SECTION_TOGGLE_ANIMATION = {
    duration: 200,
    create: { type: "easeOut", property: "opacity" },
    update: { type: "easeInEaseOut" },
    delete: { type: "easeIn", property: "opacity" },
};
function ChannelDetail() {
    var _this = this;
    var channelId = (0, expo_router_1.useLocalSearchParams)().id;
    var router = (0, expo_router_1.useRouter)();
    var theme = (0, theme_1.useTheme)();
    var _a = (0, react_1.useState)("all"), scope = _a[0], setScope = _a[1];
    var _b = (0, react_1.useState)(false), refreshing = _b[0], setRefreshing = _b[1];
    var _c = (0, react_1.useState)(function () { return new Set(DEFAULT_COLLAPSED); }), collapsed = _c[0], setCollapsed = _c[1];
    // Suppress row FadeIn on the first frame so opening the channel doesn't
    // cascade-fade every visible row. Subsequent expand/collapse toggles play
    // entering/exiting normally.
    var _d = (0, react_1.useState)(true), skipInitialEntering = _d[0], setSkipInitialEntering = _d[1];
    (0, react_1.useEffect)(function () {
        var handle = requestAnimationFrame(function () { return setSkipInitialEntering(false); });
        return function () { return cancelAnimationFrame(handle); };
    }, []);
    var activeOrgId = (0, client_core_1.useAuthStore)(function (s) { return s.activeOrgId; });
    var userId = (0, client_core_1.useAuthStore)(function (s) { var _a, _b; return (_b = (_a = s.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null; });
    var logout = (0, client_core_1.useAuthStore)(function (s) { return s.logout; });
    var channelName = (0, client_core_1.useEntityField)("channels", channelId, "name");
    var sections = (0, useChannelSessionGroups_1.useChannelSessionGroupSections)(channelId, scope, userId);
    (0, react_1.useEffect)(function () {
        if (!channelId)
            return;
        void (0, useChannelSessionGroupsQuery_1.fetchChannelSessionGroups)(channelId, "active");
    }, [channelId]);
    var handleRefresh = (0, react_1.useCallback)(function () { return __awaiter(_this, void 0, void 0, function () {
        var tasks;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!channelId)
                        return [2 /*return*/];
                    void haptics_1.haptic.medium();
                    setRefreshing(true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 3, 4]);
                    tasks = [(0, useChannelSessionGroupsQuery_1.fetchChannelSessionGroups)(channelId, "active")];
                    if (activeOrgId) {
                        tasks.push((0, useHydrate_1.refreshOrgData)(activeOrgId).then(function (ok) {
                            if (!ok) {
                                client_core_1.useEntityStore.getState().reset();
                                return logout();
                            }
                            return undefined;
                        }));
                    }
                    return [4 /*yield*/, Promise.all(tasks)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    setRefreshing(false);
                    return [7 /*endfinally*/];
                case 4: return [2 /*return*/];
            }
        });
    }); }, [channelId, activeOrgId, logout]);
    var handleOpenArchive = (0, react_1.useCallback)(function () {
        void haptics_1.haptic.light();
        router.push("/channels/".concat(channelId, "/merged-archived"));
    }, [router, channelId]);
    var handleToggleSection = (0, react_1.useCallback)(function (status) {
        void haptics_1.haptic.light();
        react_native_1.LayoutAnimation.configureNext(SECTION_TOGGLE_ANIMATION);
        setCollapsed(function (prev) {
            var next = new Set(prev);
            if (next.has(status))
                next.delete(status);
            else
                next.add(status);
            return next;
        });
    }, []);
    var items = (0, react_1.useMemo)(function () {
        var out = [];
        for (var _i = 0, sections_1 = sections; _i < sections_1.length; _i++) {
            var section = sections_1[_i];
            var isCollapsed = collapsed.has(section.status);
            out.push({
                kind: "header",
                status: section.status,
                count: section.ids.length,
                collapsed: isCollapsed,
            });
            if (isCollapsed)
                continue;
            for (var _a = 0, _b = section.ids; _a < _b.length; _a++) {
                var id = _b[_a];
                out.push({ kind: "row", groupId: id });
            }
        }
        return out;
    }, [sections, collapsed]);
    var renderListItem = (0, react_1.useCallback)(function (item) {
        if (item.kind === "header") {
            return (<SessionGroupSectionHeader_1.SessionGroupSectionHeader key={"h:".concat(item.status)} status={item.status} count={item.count} collapsed={item.collapsed} onToggle={handleToggleSection}/>);
        }
        return (<react_native_reanimated_1.default.View key={"r:".concat(item.groupId)} entering={react_native_reanimated_1.FadeIn.duration(160)} exiting={react_native_reanimated_1.FadeOut.duration(120)}>
          <SessionGroupRow_1.SessionGroupRow groupId={item.groupId} hideStatusChip/>
        </react_native_reanimated_1.default.View>);
    }, [handleToggleSection]);
    return (<>
      <expo_router_1.Stack.Screen options={{
            title: channelName !== null && channelName !== void 0 ? channelName : "Channel",
            headerRight: function () { return (<react_native_1.View style={{ marginLeft: 2 }}>
              <design_system_1.IconButton symbol="archivebox" size="sm" color="foreground" onPress={handleOpenArchive} accessibilityLabel="Merged & archived"/>
            </react_native_1.View>); },
        }}/>
      <react_native_reanimated_1.LayoutAnimationConfig skipEntering={skipInitialEntering}>
        <react_native_1.ScrollView 
    // Re-mount on segment change so scroll position resets to zero
    // instead of carrying over from the previous (often longer) list.
    key={scope} 
    // Keep the ScrollView as the root native view on the screen. The
    // home tab collapses correctly with this shape, while wrapping the
    // list in our SafeAreaView-based Screen shell does not.
    style={{ flex: 1, backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" refreshControl={<react_native_1.RefreshControl refreshing={refreshing} onRefresh={handleRefresh}/>}>
          <SessionGroupsHeader_1.SessionGroupsHeader segment={scope} onSegmentChange={setScope}/>
          {items.length === 0 ? <ActiveEmpty scope={scope}/> : items.map(renderListItem)}
        </react_native_1.ScrollView>
      </react_native_reanimated_1.LayoutAnimationConfig>
    </>);
}
function ActiveEmpty(_a) {
    var scope = _a.scope;
    if (scope === "mine") {
        return (<design_system_1.EmptyState icon="person" title="No sessions you started" subtitle="Switch to All to see everything happening in this channel."/>);
    }
    return (<design_system_1.EmptyState icon="bolt.horizontal" title="No active sessions in this channel" subtitle="Start a session from the web app to see it here."/>);
}
