"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SheetPreview;
var react_native_1 = require("react-native");
var design_system_1 = require("@/components/design-system");
var expo_router_1 = require("expo-router");
function SheetPreview() {
    var router = (0, expo_router_1.useRouter)();
    return (<design_system_1.Sheet detents={["medium", "large"]} showGrabber>
      <react_native_1.View style={{ gap: 12 }}>
        <design_system_1.Text variant="headline">Sheet Preview</design_system_1.Text>
        <design_system_1.Text variant="body" color="mutedForeground">
          Medium + large detents, grab bar, swipe-to-dismiss enabled.
        </design_system_1.Text>
        <design_system_1.Button title="Close" variant="secondary" onPress={function () { return router.back(); }}/>
      </react_native_1.View>
    </design_system_1.Sheet>);
}
