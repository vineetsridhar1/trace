import type { ComponentType } from "react";
import type { DesignScreen } from "../canvas/manifest";
import { ArtboardErrorBoundary } from "../canvas/ArtboardErrorBoundary";

export function ReviewScreen({
  screen,
  component: ScreenComponent,
}: {
  screen: DesignScreen;
  component: ComponentType;
}) {
  return (
    <div
      data-trace-review-screen={screen.id}
      style={{ width: screen.viewport.width, height: screen.viewport.height }}
    >
      <ArtboardErrorBoundary screenName={screen.name}>
        <ScreenComponent />
      </ArtboardErrorBoundary>
    </div>
  );
}
