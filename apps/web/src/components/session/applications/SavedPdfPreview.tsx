import { useRef, useState } from "react";
import { AppPreviewCanvas } from "./AppPreviewCanvas";
import type { PdfPageFormat } from "./PdfPreviewControls";

const DEFAULT_FORMAT: PdfPageFormat = { width: 210, height: 297, unit: "mm" };

export function SavedPdfPreview({
  downloadUrl,
  format = DEFAULT_FORMAT,
  url,
}: {
  downloadUrl: string | null;
  format?: PdfPageFormat;
  url: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameRevision, setFrameRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);

  return (
    <AppPreviewCanvas
      url={`${url}#toolbar=0&navpanes=0&view=Fit`}
      title="Saved PDF preview"
      frameRevision={frameRevision}
      loaded={loaded}
      refreshing={false}
      status="saved"
      onLoad={() => setLoaded(true)}
      onReload={() => {
        setLoaded(false);
        setFrameRevision((revision) => revision + 1);
      }}
      iframeRef={iframeRef}
      bare
      pdfFormat={format}
      onPdfFormatChange={() => undefined}
      onPdfDownload={() => {
        if (downloadUrl) window.location.assign(downloadUrl);
      }}
      pdfReadOnly
      sandbox={false}
    />
  );
}
