import { Sheet } from "@/components/design-system";
import { NewApplicationSheetContent } from "@/components/applications/NewApplicationSheetContent";

export default function NewApplicationSheetScreen() {
  return (
    <Sheet detents={["medium", "large"]}>
      <NewApplicationSheetContent />
    </Sheet>
  );
}
