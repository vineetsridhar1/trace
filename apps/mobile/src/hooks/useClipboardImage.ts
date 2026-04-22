import { useCallback, useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";

/**
 * Tracks whether the system clipboard currently holds an image. Checks on
 * mount and whenever `refresh()` is called (we wire `refresh` to input
 * focus). `hasImageAsync` is permission-free on iOS 16+ — it does NOT
 * trigger the "Allow paste" prompt, so we can call it on focus without
 * hassling the user.
 *
 * Intentionally does not poll. If the user copies an image while the
 * composer is already focused we'll catch it on the next focus cycle.
 */
export function useClipboardImage(): {
  hasImage: boolean;
  refresh: () => void;
  /** Hide the indicator without re-checking — call after the user acts on it. */
  dismiss: () => void;
} {
  const [hasImage, setHasImage] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const result = await Clipboard.hasImageAsync();
        if (mountedRef.current) setHasImage(Boolean(result));
      } catch {
        if (mountedRef.current) setHasImage(false);
      }
    })();
  }, []);

  const dismiss = useCallback(() => {
    setHasImage(false);
  }, []);

  useEffect(() => {
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return { hasImage, refresh, dismiss };
}
