import { useState, useCallback, useEffect } from "react";
import { Bell, BellOff, Check, X } from "lucide-react";
import { Button } from "../ui/button";
import {
  isSupported,
  getPermission,
  requestPermission,
} from "../../notifications/native";

const PERMISSION_LABELS: Record<string, { text: string; className: string }> = {
  granted: { text: "Enabled", className: "text-emerald-500" },
  denied: { text: "Blocked by browser", className: "text-destructive" },
  default: { text: "Not yet requested", className: "text-muted-foreground" },
  unsupported: { text: "Install as app for notifications", className: "text-muted-foreground" },
};

export function NotificationsSection() {
  const [permission, setPermission] = useState(getPermission);
  const [requesting, setRequesting] = useState(false);

  const handleRequest = useCallback(async () => {
    setRequesting(true);
    const result = await requestPermission();
    setPermission(result);
    setRequesting(false);
  }, []);

  // Refresh permission state when the user returns to the tab (they may have
  // changed it via browser settings while away).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) setPermission(getPermission());
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const supported = isSupported();
  const status = PERMISSION_LABELS[permission] ?? PERMISSION_LABELS.unsupported;

  return (
    <section className="mx-auto max-w-2xl mt-8">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Receive native notifications when the app is in the background.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface-deep p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {permission === "granted" ? (
              <Bell size={16} className="text-emerald-500" />
            ) : (
              <BellOff size={16} className="text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">
                Push notifications
              </p>
              <p className="text-xs text-muted-foreground">
                Session updates, mentions, and inbox items
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 text-xs ${status.className}`}>
              {permission === "granted" ? <Check size={12} /> : null}
              {permission === "denied" ? <X size={12} /> : null}
              {status.text}
            </span>

            {supported && permission === "default" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequest}
                disabled={requesting}
              >
                {requesting ? "Requesting..." : "Enable"}
              </Button>
            )}
          </div>
        </div>

        {permission === "denied" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Notifications were blocked. To re-enable, click the lock icon in your
            browser&apos;s address bar and allow notifications for this site.
          </p>
        )}

        {permission === "granted" && (
          <p className="mt-3 text-xs text-muted-foreground">
            You&apos;ll receive native notifications when the app isn&apos;t focused — for
            session status changes, mentions, inbox items, and PR updates.
          </p>
        )}

        {!supported && (
          <p className="mt-3 text-xs text-muted-foreground">
            On mobile, notifications require installing Trace as an app. Tap the share
            button in your browser and select &quot;Add to Home Screen&quot;, then open
            Trace from your home screen to enable notifications.
          </p>
        )}
      </div>

      {supported && (
        <p className="mt-2 text-xs text-muted-foreground">
          Install Trace as a PWA (Add to Home Screen) for the best notification
          experience on mobile devices.
        </p>
      )}
    </section>
  );
}
