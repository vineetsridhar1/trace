import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronsDown, ChevronsUp, MessageSquare, Minus } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

type FloatingChatState = "hidden" | "compact" | "expanded";

export function FloatingSessionChat({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FloatingChatState>("compact");
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 300, damping: 32 };

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <AnimatePresence initial={false} mode="wait">
        {state === "hidden" ? (
          <motion.div
            key="chat-pill"
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.96 }}
            transition={transition}
            className="pointer-events-auto absolute bottom-4 left-4"
          >
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full bg-background/95 px-4 shadow-lg backdrop-blur-md"
              onClick={() => setState("compact")}
              aria-label="Show chat preview"
            >
              <MessageSquare />
              Chat
            </Button>
          </motion.div>
        ) : (
          <motion.aside
            key="chat-panel"
            layout
            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
            transition={transition}
            aria-label={state === "expanded" ? "Expanded chat" : "Chat preview"}
            className={cn(
              "group/chat pointer-events-auto absolute bottom-4 left-4 overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-md",
              state === "expanded"
                ? "h-[calc(100%-2rem)] w-[min(30rem,calc(100%-2rem))]"
                : "h-[min(28rem,calc(100%-2rem))] w-[min(26rem,calc(100%-2rem))]",
            )}
          >
            <div className="absolute right-2 top-2 z-30 flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className={cn(
                  "bg-background/90 shadow-sm backdrop-blur transition-opacity",
                  state === "compact" &&
                    "opacity-0 group-hover/chat:opacity-100 group-focus-within/chat:opacity-100",
                )}
                onClick={() => setState(state === "expanded" ? "compact" : "expanded")}
                aria-label={state === "expanded" ? "Collapse chat" : "Expand chat"}
              >
                {state === "expanded" ? <ChevronsDown /> : <ChevronsUp />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="bg-background/90 shadow-sm backdrop-blur"
                onClick={() => setState("hidden")}
                aria-label="Hide chat"
              >
                <Minus />
              </Button>
            </div>

            <div className="h-full">{children}</div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
