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

// Give up silently remounting the initial frame after this many auto-retries and
// surface the manual retry UI instead of re-minting the preview URL forever.
export const MAX_FRAME_RETRIES = 3;

const FRAME_RETRY_ERROR = "The app preview didn't load. Retry to try again.";

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
      // Exhausted the silent-retry budget: stop remounting and surface the
      // manual retry UI instead of re-minting the preview URL again.
      if (state.attempts >= MAX_FRAME_RETRIES) {
        return { ...state, error: FRAME_RETRY_ERROR, refreshing: false };
      }
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
