import { useEffect, useState } from "react";

let cachedAnimation: Record<string, unknown> | null = null;
let loadAttempted = false;

export function useAiLoadingAnimation() {
  const [animation, setAnimation] = useState(cachedAnimation);

  useEffect(() => {
    if (cachedAnimation || loadAttempted) return;
    loadAttempted = true;
    import("../assets/ai-loading.json")
      .then((mod) => {
        cachedAnimation = mod.default as Record<string, unknown>;
        setAnimation(cachedAnimation);
      })
      .catch(() => {
        // Animation file not yet added
      });
  }, []);

  return animation;
}
