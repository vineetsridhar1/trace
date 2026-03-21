import { Download, Share, X } from "lucide-react";
import { Button } from "./ui/button";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

export function InstallBanner() {
  const prompt = useInstallPrompt();

  if (!prompt.canInstall || prompt.dismissed) return null;

  return (
    <div className="flex items-center gap-3 border-b border-border bg-surface-deep px-4 py-2">
      <Download size={16} className="shrink-0 text-muted-foreground" />
      <p className="flex-1 text-sm text-foreground">
        {prompt.platform === "ios" ? (
          <>
            Install Trace for notifications and a full-screen experience. Tap{" "}
            <Share size={12} className="inline -mt-0.5" /> then{" "}
            <span className="font-medium">Add to Home Screen</span>.
          </>
        ) : (
          "Install Trace for notifications and a full-screen experience."
        )}
      </p>
      {prompt.platform === "native" && (
        <Button size="sm" variant="outline" onClick={prompt.install}>
          Install
        </Button>
      )}
      <button
        onClick={prompt.dismiss}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
