"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = RootLayout;
require("@/lib/platform-mobile");
require("@/lib/event-bindings");
var react_1 = require("react");
var react_native_1 = require("react-native");
var react_native_gesture_handler_1 = require("react-native-gesture-handler");
var expo_router_1 = require("expo-router");
var expo_status_bar_1 = require("expo-status-bar");
var client_core_1 = require("@trace/client-core");
function RootLayout() {
    var fetchMe = (0, client_core_1.useAuthStore)(function (s) { return s.fetchMe; });
    var loading = (0, client_core_1.useAuthStore)(function (s) { return s.loading; });
    (0, react_1.useEffect)(function () {
        void fetchMe();
    }, [fetchMe]);
    if (loading) {
        return (<react_native_gesture_handler_1.GestureHandlerRootView style={styles.root}>
        <expo_status_bar_1.StatusBar style="light"/>
        <react_native_1.View style={styles.splash}>
          <react_native_1.ActivityIndicator color="#fff"/>
        </react_native_1.View>
      </react_native_gesture_handler_1.GestureHandlerRootView>);
    }
    return (<react_native_gesture_handler_1.GestureHandlerRootView style={styles.root}>
      <expo_status_bar_1.StatusBar style="light"/>
      <expo_router_1.Stack screenOptions={{ headerShown: false }}/>
    </react_native_gesture_handler_1.GestureHandlerRootView>);
}
var styles = react_native_1.StyleSheet.create({
    root: {
        flex: 1,
    },
    splash: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#000",
    },
});
