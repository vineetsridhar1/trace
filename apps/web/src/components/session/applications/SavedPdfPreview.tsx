import { Archive, Download } from "lucide-react";
import { Button } from "../../ui/button";

export function SavedPdfPreview({ downloadUrl, url }: { downloadUrl: string | null; url: string }) {
  return (
    <div className="relative h-full bg-[#111113]">
      <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
        <Archive className="size-3.5" />
        <span>Saved PDF · live preview stopped</span>
        {downloadUrl ? (
          <Button
            size="xs"
            variant="ghost"
            className="ml-1 h-6"
            onClick={() => window.location.assign(downloadUrl)}
          >
            <Download className="size-3" />
            Download
          </Button>
        ) : null}
      </div>
      <iframe
        src={`${url}#toolbar=0&navpanes=0&view=Fit`}
        title="Saved PDF preview"
        className="size-full border-0"
      />
    </div>
  );
}
