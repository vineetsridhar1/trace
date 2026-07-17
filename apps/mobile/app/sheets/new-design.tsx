import { Sheet } from "@/components/design-system";
import { NewDesignSheetContent } from "@/components/designs/NewDesignSheetContent";

export default function NewDesignSheetScreen() {
  return (
    <Sheet detents={["medium", "large"]}>
      <NewDesignSheetContent />
    </Sheet>
  );
}
