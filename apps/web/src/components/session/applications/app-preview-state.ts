export type AppPreviewState = {
  error: string | null;
  frameLoaded: boolean;
  frameRevision: number;
  refreshing: boolean;
  requestRevision: number;
  url: string | null;
};

export type AppPreviewAction =
  | { type: "frame-loaded" }
  | { type: "reload" }
  | { type: "request-failed"; error: string }
  | { type: "request-succeeded"; url: string };

export const initialAppPreviewState: AppPreviewState = {
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
    case "reload":
      return {
        ...state,
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
        // Reset so the loading overlay reappears while the freshly-mounted
        // iframe (new frameRevision) fetches — otherwise a reload shows the
        // blank iframe with no loader.
        frameLoaded: false,
        frameRevision: state.frameRevision + 1,
        refreshing: false,
        url: action.url,
      };
  }
}
