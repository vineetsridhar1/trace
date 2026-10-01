import { create } from "zustand";

export type ReviewView = "changes" | "guide";
export type ReviewRailTab = "chat" | "threads";
export type ReviewThreadFilter = "all" | "private" | "selected" | "delivered";

export interface ReviewHighlight {
  filePath: string;
  startLine: number;
  endLine: number;
}

interface ReviewUiSelection {
  view: ReviewView;
  railTab: ReviewRailTab;
  threadFilter: ReviewThreadFilter;
  activeFilePath: string | null;
  activeThreadId: string | null;
  /** Set to ask the Changes view to scroll; cleared once it has. */
  requestedFilePath: string | null;
  requestedLine: number | null;
  /** The range the Guide or a thread last pointed at, kept lit until something else is chosen. */
  highlight: ReviewHighlight | null;
  collapsedFilePaths: string[];
}

interface ReviewUiState {
  byReviewId: Record<string, ReviewUiSelection>;
  patch(reviewId: string, value: Partial<ReviewUiSelection>): void;
  navigate(reviewId: string, highlight: ReviewHighlight): void;
  toggleFileCollapsed(reviewId: string, filePath: string): void;
}

const emptySelection = (): ReviewUiSelection => ({
  view: "changes",
  railTab: "chat",
  threadFilter: "all",
  activeFilePath: null,
  activeThreadId: null,
  requestedFilePath: null,
  requestedLine: null,
  highlight: null,
  collapsedFilePaths: [],
});

export const useReviewUiStore = create<ReviewUiState>((set) => ({
  byReviewId: {},
  patch: (reviewId, value) =>
    set((state) => ({
      byReviewId: {
        ...state.byReviewId,
        [reviewId]: { ...(state.byReviewId[reviewId] ?? emptySelection()), ...value },
      },
    })),
  navigate: (reviewId, highlight) =>
    set((state) => {
      const current = state.byReviewId[reviewId] ?? emptySelection();
      return {
        byReviewId: {
          ...state.byReviewId,
          [reviewId]: {
            ...current,
            view: "changes",
            requestedFilePath: highlight.filePath,
            requestedLine: highlight.startLine,
            activeFilePath: highlight.filePath,
            highlight,
            collapsedFilePaths: current.collapsedFilePaths.filter(
              (path) => path !== highlight.filePath,
            ),
          },
        },
      };
    }),
  toggleFileCollapsed: (reviewId, filePath) =>
    set((state) => {
      const current = state.byReviewId[reviewId] ?? emptySelection();
      const collapsed = current.collapsedFilePaths.includes(filePath);
      return {
        byReviewId: {
          ...state.byReviewId,
          [reviewId]: {
            ...current,
            collapsedFilePaths: collapsed
              ? current.collapsedFilePaths.filter((path) => path !== filePath)
              : [...current.collapsedFilePaths, filePath],
          },
        },
      };
    }),
}));

export function reviewUiSelection(state: ReviewUiState, reviewId: string): ReviewUiSelection {
  return state.byReviewId[reviewId] ?? emptySelection();
}
