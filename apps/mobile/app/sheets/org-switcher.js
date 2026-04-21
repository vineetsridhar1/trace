"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = OrgSwitcherSheetScreen;
var design_system_1 = require("@/components/design-system");
var OrgSwitcherContent_1 = require("@/components/settings/OrgSwitcherContent");
function OrgSwitcherSheetScreen() {
    return (<design_system_1.Sheet detents={["medium"]}>
      <OrgSwitcherContent_1.OrgSwitcherContent />
    </design_system_1.Sheet>);
}
