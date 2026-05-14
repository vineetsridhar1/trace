import { Sheet } from "@/components/design-system";
import { BrowseChannelsSheetContent } from "@/components/channels/BrowseChannelsSheetContent";

export default function BrowseChannelsSheetScreen() {
  return (
    <Sheet detents={["large"]}>
      <BrowseChannelsSheetContent />
    </Sheet>
  );
}
