"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SessionStreamScreen;
var react_1 = require("react");
var expo_router_1 = require("expo-router");
var client_core_1 = require("@trace/client-core");
var SessionSurface_1 = require("@/components/sessions/SessionSurface");
var useSessionGroupDetail_1 = require("@/hooks/useSessionGroupDetail");
/**
 * Deep-link target for `trace://sessions/:groupId/:sessionId`. Renders the
 * same `SessionSurface` composition as the Session Player (§10.8); tab-strip
 * selections route via `router.replace` instead of updating the Player's
 * `overlaySessionId`.
 */
function SessionStreamScreen() {
    var _a = (0, expo_router_1.useLocalSearchParams)(), groupId = _a.groupId, sessionId = _a.sessionId;
    var router = (0, expo_router_1.useRouter)();
    (0, useSessionGroupDetail_1.useEnsureSessionGroupDetail)(groupId);
    var sessionIds = (0, useSessionGroupDetail_1.useSessionGroupSessionIds)(groupId);
    var sessionName = (0, client_core_1.useEntityField)("sessions", sessionId, "name");
    (0, react_1.useEffect)(function () {
        if (!groupId || !sessionId || sessionIds.length === 0)
            return;
        if (sessionIds.includes(sessionId))
            return;
        router.replace("/sessions/".concat(groupId, "/").concat(sessionIds[0]));
    }, [groupId, router, sessionId, sessionIds]);
    var handleSelectSession = (0, react_1.useCallback)(function (nextId) {
        router.replace("/sessions/".concat(groupId, "/").concat(nextId));
    }, [groupId, router]);
    return (<>
      <expo_router_1.Stack.Screen options={{ title: sessionName !== null && sessionName !== void 0 ? sessionName : "Session" }}/>
      <SessionSurface_1.SessionSurface sessionId={sessionId} onSelectSession={handleSelectSession}/>
    </>);
}
