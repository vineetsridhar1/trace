import { useState } from "react";

export default function WelcomeScreen() {
  const [started, setStarted] = useState(false);

  return (
    <main className="flex h-full flex-col justify-between bg-[#f7f5f0] p-8 text-[#191919]">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>Northstar</span>
        <span className="rounded-full bg-black/5 px-3 py-1 text-xs">Preview</span>
      </div>
      <section>
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-[#69645b]">
          Your next idea
        </p>
        <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.05em]">
          Make space for something new.
        </h1>
        <p className="mt-5 max-w-xs text-base leading-7 text-[#5f5a52]">
          This example screen is agent-editable. The surrounding canvas stays stable while your
          design evolves through chat.
        </p>
      </section>
      <button
        type="button"
        onClick={() => setStarted((value) => !value)}
        className="rounded-2xl bg-[#191919] px-5 py-4 text-left text-sm font-semibold text-white shadow-lg transition-transform active:scale-[0.98]"
      >
        {started ? "Interaction works" : "Try the interaction"}
      </button>
    </main>
  );
}
