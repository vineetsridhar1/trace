import { useEffect, useState } from "react";

/**
 * Whether this renderer is visible to the user. Expensive visual work should
 * pause while Trace is backgrounded and recreate from the current store state
 * when the app returns.
 */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const updateVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  return visible;
}
