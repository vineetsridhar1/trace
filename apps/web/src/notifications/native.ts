/**
 * Native browser notification support.
 *
 * Shows OS-level notifications when the app is not focused (tab backgrounded,
 * window minimized, or running as an installed PWA in the background).
 *
 * Falls back silently if the browser doesn't support notifications or the user
 * hasn't granted permission.
 */

/** Whether the browser supports the Notification API */
export function isSupported(): boolean {
  return "Notification" in window;
}

/** Current permission state */
export function getPermission(): NotificationPermission | "unsupported" {
  if (!isSupported()) return "unsupported";
  return Notification.permission;
}

/** Request notification permission. Returns the resulting permission state. */
export async function requestPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result;
}

/** Whether the document is currently hidden (tab backgrounded, window minimized, etc.) */
export function isAppHidden(): boolean {
  return document.hidden || !document.hasFocus();
}

/**
 * Show a native notification if the app is not focused and permission is granted.
 * Returns true if a notification was shown.
 */
export function showNativeNotification(
  title: string,
  options?: { body?: string; tag?: string; onClick?: () => void },
): boolean {
  if (!isSupported()) return false;
  if (Notification.permission !== "granted") return false;
  if (!isAppHidden()) return false;

  const notification = new Notification(title, {
    body: options?.body,
    icon: "/icon-192.svg",
    badge: "/icon-192.svg",
    tag: options?.tag, // Replaces existing notification with same tag
    silent: false,
  });

  if (options?.onClick) {
    notification.onclick = () => {
      window.focus();
      options.onClick!();
      notification.close();
    };
  }

  return true;
}
