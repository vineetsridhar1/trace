import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "../ui/button";
import { useGitHubDeviceLogin } from "./useGitHubDeviceLogin";

export function GitHubDeviceLoginPanel({
  actionLabel = "Sign in with GitHub",
  onSuccess,
}: {
  actionLabel?: string;
  onSuccess?: () => void;
}) {
  const { cancel, copied, copyCode, deviceLogin, deviceStatus, error, start, submitting } =
    useGitHubDeviceLogin(onSuccess);

  return (
    <div className="space-y-3">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-surface-elevated/45 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />
        {deviceLogin ? (
          <>
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium text-muted-foreground">Enter this GitHub code</p>
              <div className="rounded-lg border border-white/10 bg-surface-deep/55 px-4 py-3 font-mono text-2xl font-semibold tracking-widest text-foreground shadow-inner shadow-black/20">
                {deviceLogin.userCode}
              </div>
              <p className="text-sm leading-5 text-muted-foreground">
                Copy the code, then open GitHub to confirm your identity. Trace requests no GitHub
                permissions and cannot access your repositories.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => void copyCode()} className="gap-2">
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                className="gap-2"
                onClick={() => window.open(deviceLogin.verificationUri, "_blank", "noreferrer")}
              >
                <ExternalLink size={16} />
                Open GitHub
              </Button>
            </div>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {deviceStatus === "success" ? "Restoring your session..." : "Waiting for GitHub..."}
            </p>

            <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={cancel}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={() => void start()}
              size="lg"
              className="w-full gap-2"
              disabled={submitting}
            >
              <GitHubMark />
              {submitting ? "Starting..." : actionLabel}
            </Button>
            <p className="mt-4 text-center text-sm leading-5 text-muted-foreground">
              GitHub is only used to verify your identity. Trace requests no GitHub permissions and
              cannot access your repositories.
            </p>
          </>
        )}
      </div>
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function GitHubMark() {
  return (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}
