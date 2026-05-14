import { Sheet } from "@/components/design-system";
import { SessionDefaultsSheetContent } from "@/components/settings/SessionDefaultsSheetContent";

export default function SessionDefaultsSheetScreen() {
  return (
    <Sheet detents={["large"]}>
      <SessionDefaultsSheetContent />
    </Sheet>
  );
}
