import { useState, useEffect } from "react";

let cachedId: string | null = null;

/**
 * Returns the local Electron bridge's instanceId, or null when running in a browser.
 * The value is fetched once and cached for the lifetime of the app.
 */
export function useLocalBridgeInstanceId(): string | null {
  const [id, setId] = useState<string | null>(cachedId);

  useEffect(() => {
    if (cachedId !== null) return;
    if (typeof window.trace?.getBridgeInstanceId !== "function") return;

    window.trace.getBridgeInstanceId().then((instanceId: string) => {
      cachedId = instanceId;
      setId(instanceId);
    });
  }, []);

  return id;
}
