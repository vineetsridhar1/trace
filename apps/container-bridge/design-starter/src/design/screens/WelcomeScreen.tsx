import { useState } from "react";
import { DesignBadge } from "../primitives/DesignBadge";
import { DesignButton } from "../primitives/DesignButton";
import { DesignScreen } from "../primitives/DesignScreen";

export default function WelcomeScreen() {
  const [started, setStarted] = useState(false);

  return (
    <DesignScreen className="flex flex-col justify-between p-8">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span
          data-trace-id="welcome-brand-name"
          data-trace-source="src/design/screens/WelcomeScreen.tsx"
        >
          Northstar
        </span>
        <DesignBadge>Preview</DesignBadge>
      </div>
      <section>
        <p
          data-trace-id="welcome-eyebrow"
          data-trace-source="src/design/screens/WelcomeScreen.tsx"
          className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-design-muted"
        >
          Your next idea
        </p>
        <h1
          data-trace-id="welcome-heading"
          data-trace-source="src/design/screens/WelcomeScreen.tsx"
          className="font-design-display text-5xl font-semibold leading-[0.95] tracking-[-0.05em]"
        >
          Make space for something new.
        </h1>
        <p
          data-trace-id="welcome-description"
          data-trace-source="src/design/screens/WelcomeScreen.tsx"
          className="mt-5 max-w-xs text-base leading-7 text-design-muted"
        >
          This example screen is agent-editable. The surrounding canvas stays stable while your
          design evolves through chat.
        </p>
      </section>
      <DesignButton
        onClick={() => setStarted((value) => !value)}
        className="justify-start active:scale-[0.98]"
      >
        {started ? "Interaction works" : "Try the interaction"}
      </DesignButton>
    </DesignScreen>
  );
}
