import manifestSource from "../design.canvas.json";
import tokenSource from "../trace.tokens.json";
import { DesignCanvas } from "./canvas/DesignCanvas";
import { validateDesignManifest } from "./canvas/manifest";
import { resolveScreenComponent } from "./canvas/screen-modules";
import { designTokenStyle, validateDesignTokens } from "./design/tokens";
import { ReviewScreen } from "./review/ReviewScreen";

const screenModules = import.meta.glob("./design/screens/*.tsx", { eager: true });
const manifest = validateDesignManifest(manifestSource);
const tokens = validateDesignTokens(tokenSource);

export function App() {
  const reviewScreenId = new URLSearchParams(window.location.search).get("__trace_review_screen");
  const reviewScreen = manifest.screens.find((screen) => screen.id === reviewScreenId);
  const reviewComponent = reviewScreen
    ? resolveScreenComponent(screenModules, reviewScreen.component)
    : null;

  return (
    <div className="h-screen w-screen" style={designTokenStyle(tokens)}>
      {reviewScreen && reviewComponent ? (
        <ReviewScreen screen={reviewScreen} component={reviewComponent} />
      ) : (
        <DesignCanvas manifest={manifest} screenModules={screenModules} />
      )}
    </div>
  );
}
