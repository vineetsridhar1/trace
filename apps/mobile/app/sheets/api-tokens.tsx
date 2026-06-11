import { Sheet } from "@/components/design-system";
import { ApiTokensSheetContent } from "@/components/settings/ApiTokensSheetContent";

export default function ApiTokensSheetScreen() {
  return (
    <Sheet detents={["large"]}>
      <ApiTokensSheetContent />
    </Sheet>
  );
}
