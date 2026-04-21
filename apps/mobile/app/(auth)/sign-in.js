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
exports.default = SignInScreen;
var react_1 = require("react");
var react_native_1 = require("react-native");
var ExpoLinking = require("expo-linking");
var WebBrowser = require("expo-web-browser");
var client_core_1 = require("@trace/client-core");
var env_1 = require("@/lib/env");
var REDIRECT_URL = "trace://auth/callback";
var TERMS_URL = "https://trace.app/terms";
var PRIVACY_URL = "https://trace.app/privacy";
function tokenFromCallback(rawUrl) {
    var _a;
    try {
        var parsed = ExpoLinking.parse(rawUrl);
        var token = (_a = parsed.queryParams) === null || _a === void 0 ? void 0 : _a.token;
        return typeof token === "string" ? token : null;
    }
    catch (_b) {
        return null;
    }
}
function SignInScreen() {
    var signInWithToken = (0, client_core_1.useAuthStore)(function (s) { return s.signInWithToken; });
    var _a = (0, react_1.useState)(false), loading = _a[0], setLoading = _a[1];
    var _b = (0, react_1.useState)(null), error = _b[0], setError = _b[1];
    function handleSignIn() {
        return __awaiter(this, void 0, void 0, function () {
            var result, token, err_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (loading)
                            return [2 /*return*/];
                        setError(null);
                        if (!(0, env_1.isApiUrlConfigured)()) {
                            setError("EXPO_PUBLIC_API_URL is not configured. Restart Metro with " +
                                "EXPO_PUBLIC_API_URL=http://<host>:4000.");
                            return [2 /*return*/];
                        }
                        setLoading(true);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, 5, 6]);
                        return [4 /*yield*/, WebBrowser.openAuthSessionAsync("".concat(env_1.API_URL, "/auth/github?origin=trace-mobile"), REDIRECT_URL)];
                    case 2:
                        result = _a.sent();
                        if (result.type !== "success") {
                            if (result.type === "cancel" || result.type === "dismiss")
                                return [2 /*return*/];
                            setError("Sign-in did not complete. Please try again.");
                            return [2 /*return*/];
                        }
                        token = tokenFromCallback(result.url);
                        if (!token) {
                            setError("Sign-in returned no token. Please try again.");
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, signInWithToken(token)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 4:
                        err_1 = _a.sent();
                        console.error("[sign-in] failed", err_1);
                        setError("Something went wrong. Please try again.");
                        return [3 /*break*/, 6];
                    case 5:
                        setLoading(false);
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        });
    }
    return (<react_native_1.View style={styles.container}>
      <react_native_1.View style={styles.center}>
        <react_native_1.Text style={styles.wordmark}>trace</react_native_1.Text>
        <react_native_1.Pressable accessibilityRole="button" onPress={handleSignIn} disabled={loading} style={function (_a) {
            var pressed = _a.pressed;
            return [
                styles.button,
                (pressed || loading) && styles.buttonPressed,
            ];
        }}>
          {loading ? (<react_native_1.ActivityIndicator color="#000"/>) : (<react_native_1.Text style={styles.buttonText}>Continue with GitHub</react_native_1.Text>)}
        </react_native_1.Pressable>
        {error && <react_native_1.Text style={styles.error}>{error}</react_native_1.Text>}
      </react_native_1.View>

      <react_native_1.View style={styles.footer}>
        <react_native_1.Pressable onPress={function () { return react_native_1.Linking.openURL(TERMS_URL); }} hitSlop={12}>
          <react_native_1.Text style={styles.footerLink}>Terms</react_native_1.Text>
        </react_native_1.Pressable>
        <react_native_1.Text style={styles.footerSep}>·</react_native_1.Text>
        <react_native_1.Pressable onPress={function () { return react_native_1.Linking.openURL(PRIVACY_URL); }} hitSlop={12}>
          <react_native_1.Text style={styles.footerLink}>Privacy</react_native_1.Text>
        </react_native_1.Pressable>
      </react_native_1.View>
    </react_native_1.View>);
}
var styles = react_native_1.StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
        paddingHorizontal: 24,
        paddingBottom: 32,
    },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
    },
    wordmark: {
        color: "#fff",
        fontSize: 36,
        fontWeight: "700",
        letterSpacing: -1,
    },
    button: {
        backgroundColor: "#fff",
        paddingHorizontal: 28,
        paddingVertical: 14,
        borderRadius: 999,
        minWidth: 240,
        alignItems: "center",
    },
    buttonPressed: {
        opacity: 0.7,
    },
    buttonText: {
        color: "#000",
        fontSize: 16,
        fontWeight: "600",
    },
    error: {
        color: "#ff6b6b",
        textAlign: "center",
        paddingHorizontal: 24,
    },
    footer: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
    },
    footerLink: {
        color: "#888",
        fontSize: 13,
    },
    footerSep: {
        color: "#444",
        fontSize: 13,
    },
});
