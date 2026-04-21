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
exports.default = ChannelsIndex;
var react_1 = require("react");
var expo_router_1 = require("expo-router");
var flash_list_1 = require("@shopify/flash-list");
var client_core_1 = require("@trace/client-core");
var design_system_1 = require("@/components/design-system");
var ChannelListRow_1 = require("@/components/channels/ChannelListRow");
var ChannelGroupHeader_1 = require("@/components/channels/ChannelGroupHeader");
var useCodingChannels_1 = require("@/hooks/useCodingChannels");
var useHydrate_1 = require("@/hooks/useHydrate");
var haptics_1 = require("@/lib/haptics");
function ChannelsIndex() {
    var _this = this;
    var activeOrgId = (0, client_core_1.useAuthStore)(function (s) { return s.activeOrgId; });
    var logout = (0, client_core_1.useAuthStore)(function (s) { return s.logout; });
    var _a = (0, react_1.useState)(""), search = _a[0], setSearch = _a[1];
    var _b = (0, react_1.useState)(false), refreshing = _b[0], setRefreshing = _b[1];
    var keys = (0, useCodingChannels_1.useCodingChannelKeys)({ search: search });
    // hideWhenScrolling is disabled because the pull-to-reveal observation
    // (UISearchController + hidesSearchBarWhenScrolling=YES) conflicts with
    // the tab bar's iOS 26 minimize-on-scroll binding on the same scroll
    // view, stopping the tab bar and bottom accessory from collapsing.
    var searchBarOptions = (0, react_1.useMemo)(function () { return ({
        placeholder: "Search channels",
        hideWhenScrolling: false,
        onChangeText: function (e) { return setSearch(e.nativeEvent.text); },
        onCancelButtonPress: function () { return setSearch(""); },
    }); }, []);
    var handleRefresh = (0, react_1.useCallback)(function () { return __awaiter(_this, void 0, void 0, function () {
        var ok;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!activeOrgId)
                        return [2 /*return*/];
                    void haptics_1.haptic.medium();
                    setRefreshing(true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 5, 6]);
                    return [4 /*yield*/, (0, useHydrate_1.refreshOrgData)(activeOrgId)];
                case 2:
                    ok = _a.sent();
                    if (!!ok) return [3 /*break*/, 4];
                    client_core_1.useEntityStore.getState().reset();
                    return [4 /*yield*/, logout()];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [3 /*break*/, 6];
                case 5:
                    setRefreshing(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); }, [activeOrgId, logout]);
    return (<design_system_1.Screen edges={["left", "right"]}>
      <expo_router_1.Stack.Screen options={{ headerSearchBarOptions: searchBarOptions }}/>
      <flash_list_1.FlashList data={keys} renderItem={renderItem} keyExtractor={keyExtractor} getItemType={getItemType} contentInsetAdjustmentBehavior="automatic" onRefresh={handleRefresh} refreshing={refreshing} ListEmptyComponent={<ChannelsEmpty search={search}/>}/>
    </design_system_1.Screen>);
}
function renderItem(_a) {
    var item = _a.item;
    var _b = (0, useCodingChannels_1.parseItemKey)(item), kind = _b.kind, id = _b.id;
    if (kind === "group")
        return <ChannelGroupHeader_1.ChannelGroupHeader groupId={id}/>;
    return <ChannelListRow_1.ChannelListRow channelId={id}/>;
}
function keyExtractor(item) {
    return item;
}
function getItemType(item) {
    return item.startsWith("group:") ? "group" : "channel";
}
function ChannelsEmpty(_a) {
    var search = _a.search;
    if (search.trim().length > 0) {
        return (<design_system_1.EmptyState icon="magnifyingglass" title="No channels found" subtitle={"Nothing matches \"".concat(search.trim(), "\".")}/>);
    }
    return (<design_system_1.EmptyState icon="tray" title="No coding channels yet" subtitle="Channels appear here as they're created in the web app."/>);
}
