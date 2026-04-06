import { motion } from "framer-motion";
import { useHighlightTurnId } from "../hooks/useAiConversationSelectors";

interface TurnHighlightProps {
  turnId: string;
  children: React.ReactNode;
}

/**
 * Wraps a turn row and applies a pulse highlight animation when
 * `highlightTurnId` matches. Used to visually indicate the fork point
 * after navigating back to a parent branch.
 */
export function TurnHighlight({ turnId, children }: TurnHighlightProps) {
  const highlightTurnId = useHighlightTurnId();
  const isHighlighted = highlightTurnId === turnId;

  if (!isHighlighted) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ backgroundColor: "hsl(var(--primary) / 0.15)" }}
      animate={{ backgroundColor: "hsl(var(--primary) / 0)" }}
      transition={{ duration: 1.2, ease: "easeOut" }}
      className="rounded-lg"
    >
      {children}
    </motion.div>
  );
}
