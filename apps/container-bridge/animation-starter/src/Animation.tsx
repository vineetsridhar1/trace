import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Animation() {
  const [active, setActive] = useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
      <button
        type="button"
        onClick={() => setActive((value) => !value)}
        className="flex flex-col items-center gap-6 rounded-3xl border border-white/10 bg-white/[0.03] px-12 py-16 text-center"
      >
        <motion.div
          animate={{ rotate: active ? 135 : 0, scale: active ? 1.15 : 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="flex size-16 items-center justify-center rounded-2xl bg-emerald-400"
        >
          <span className="text-2xl font-semibold text-zinc-950">+</span>
        </motion.div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your animation starts here</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
            Describe the motion or interaction you want. Click this button to see it react.
          </p>
        </div>

        <AnimatePresence>
          {active ? (
            <motion.p
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-xs font-medium uppercase tracking-wider text-emerald-300"
            >
              Toggled
            </motion.p>
          ) : null}
        </AnimatePresence>
      </button>
    </main>
  );
}
