import { Sheet } from "@/components/design-system";
import { OrgSwitcherContent } from "@/components/settings/OrgSwitcherContent";

export default function OrgSwitcherSheetScreen() {
  return (
    <Sheet detents={["medium"]}>
      <OrgSwitcherContent />
    </Sheet>
  );
}
