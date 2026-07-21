import { useState } from "react";
import { KeyRound, LogIn } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { CodexIcon } from "../ui/tool-icons";

type AuthenticationMethod = "choose" | "login" | "access_token" | "api_key";

export function CodexAuthenticationDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (provider: "codex_auth_json" | "codex_access_token" | "openai", token: string) => Promise<void>;
}) {
  const [method, setMethod] = useState<AuthenticationMethod>("choose");
  const [value, setValue] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setMethod("choose");
    setValue("");
    setError(null);
    onOpenChange(false);
  }

  async function login() {
    if (!window.trace?.loginCodexWithChatgpt) {
      setError("ChatGPT login is available in the Trace desktop app.");
      return;
    }
    setIsLoggingIn(true);
    setError(null);
    try {
      await onSave("codex_auth_json", await window.trace.loginCodexWithChatgpt());
      close();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "ChatGPT login failed");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function saveToken() {
    if (!value.trim() || method === "choose" || method === "login") return;
    try {
      await onSave(method === "access_token" ? "codex_access_token" : "openai", value.trim());
      close();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save credential");
    }
  }

  const options = [
    {
      method: "login" as const,
      title: "Log in with ChatGPT",
      description: "Open Codex login and securely save your ChatGPT session.",
      Icon: LogIn,
    },
    {
      method: "access_token" as const,
      title: "Codex access token",
      description: "Use a trusted-automation token from your organization.",
      Icon: KeyRound,
    },
    {
      method: "api_key" as const,
      title: "OpenAI API key",
      description: "Use an API key and pay through your OpenAI API account.",
      Icon: KeyRound,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Authenticate Codex</DialogTitle>
        </DialogHeader>
        {method === "choose" ? (
          <div className="flex flex-col gap-3 py-2">
            {options.map(({ method: optionMethod, title, description, Icon }) => (
              <button
                key={optionMethod}
                type="button"
                onClick={() => setMethod(optionMethod)}
                className="flex items-center gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {optionMethod === "login" ? (
                  <CodexIcon className="h-6 w-6" />
                ) : (
                  <Icon size={22} className="text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </button>
            ))}
          </div>
        ) : method === "login" ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Codex will open a browser window for you to sign in. Trace will save the resulting
              session securely for cloud runs.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMethod("choose")} disabled={isLoggingIn}>
                Back
              </Button>
              <Button onClick={login} disabled={isLoggingIn}>
                {isLoggingIn ? "Waiting for login…" : "Continue with ChatGPT"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <Input
              autoFocus
              type="password"
              placeholder={method === "access_token" ? "Codex access token" : "sk-..."}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void saveToken()}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMethod("choose")}>
                Back
              </Button>
              <Button onClick={() => void saveToken()} disabled={!value.trim()}>
                Save
              </Button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
