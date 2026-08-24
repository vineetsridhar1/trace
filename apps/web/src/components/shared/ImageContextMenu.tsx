import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { copyImageToClipboard } from "@/lib/copy-image";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export function ImageContextMenu({ src, children }: { src: string; children: ReactNode }) {
  const handleCopy = async () => {
    try {
      await copyImageToClipboard(src);
      toast.success("Image copied");
    } catch (error) {
      console.warn("Failed to copy image:", error);
      toast.error("Failed to copy image");
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger className="contents" render={<div />}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => void handleCopy()}>
          <Copy />
          Copy image
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
