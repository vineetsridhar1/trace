import { Check, Copy } from "lucide-react";
import { Button } from "../ui/button";

export function ServiceTokenSecretView({
  rawToken,
  copied,
  onCopy,
}: {
  rawToken: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-3 py-2">
      <div className="rounded-lg border border-border bg-surface-deep p-3">
        <code className="block break-all text-xs text-foreground">{rawToken}</code>
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={onCopy}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy token"}
      </Button>
    </div>
  );
}
