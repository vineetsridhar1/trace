export type AppPreviewState = {
  attempts: number;
  error: string | null;
  frameLoaded: boolean;
  frameRevision: number;
  refreshing: boolean;
  requestRevision: number;
  url: string | null;
};

export type AppPreviewAction =
  | { type: "frame-loaded" }
  | { type: "frame-retry" }
  | { type: "reload" }
  | { type: "request-failed"; error: string }
  | { type: "request-succeeded"; url: string };

export const initialAppPreviewState: AppPreviewState = {
  attempts: 0,
  error: null,
  frameLoaded: false,
  frameRevision: 0,
  refreshing: false,
  requestRevision: 0,
  url: null,
};

export function appPreviewReducer(
  state: AppPreviewState,
  action: AppPreviewAction,
): AppPreviewState {
  switch (action.type) {
    case "frame-loaded":
      return { ...state, frameLoaded: true };
    case "frame-retry":
      // A running dev server can briefly stop responding while the agent edits
      // files or Vite recompiles. Keep recovering quietly instead of treating
      // that expected transition as a user-facing preview failure.
      return {
        ...state,
        attempts: state.attempts + 1,
        error: null,
        refreshing: Boolean(state.url),
        requestRevision: state.requestRevision + 1,
      };
    case "reload":
      // Manual retry resets the auto-retry budget.
      return {
        ...state,
        attempts: 0,
        error: null,
        refreshing: Boolean(state.url),
        requestRevision: state.requestRevision + 1,
      };
    case "request-failed":
      return state.url
        ? { ...state, refreshing: false }
        : { ...state, error: action.error, refreshing: false };
    case "request-succeeded":
      return {
        ...state,
        error: null,
        // Reset so the frame's loading line reappears while the freshly-mounted
        // iframe (new frameRevision) fetches.
        frameLoaded: false,
        frameRevision: state.frameRevision + 1,
        refreshing: false,
        url: action.url,
      };
  }
}
