import { Sheet } from "@/components/design-system";
import { AccountSheetContent } from "@/components/settings/AccountSheetContent";

export default function AccountSheetScreen() {
  return (
    <Sheet detents={["large"]}>
      <AccountSheetContent />
    </Sheet>
  );
}
