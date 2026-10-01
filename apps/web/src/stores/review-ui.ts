import { create } from "zustand";

export type ReviewView = "changes" | "guide";

interface ReviewUiSelection {
  view: ReviewView;
  snapshotId: string | null;
  activeFilePath: string | null;
  activeThreadId: string | null;
  requestedFilePath: string | null;
  requestedLine: number | null;
}

interface ReviewUiState {
  byReviewId: Record<string, ReviewUiSelection>;
  patch(reviewId: string, value: Partial<ReviewUiSelection>): void;
  navigate(reviewId: string, filePath?: string | null, line?: number | null): void;
}

const emptySelection = (): ReviewUiSelection => ({
  view: "changes",
  snapshotId: null,
  activeFilePath: null,
  activeThreadId: null,
  requestedFilePath: null,
  requestedLine: null,
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
  navigate: (reviewId, filePath = null, line = null) =>
    set((state) => ({
      byReviewId: {
        ...state.byReviewId,
        [reviewId]: {
          ...(state.byReviewId[reviewId] ?? emptySelection()),
          view: "changes",
          requestedFilePath: filePath,
          requestedLine: line,
          activeFilePath: filePath,
        },
      },
    })),
}));

export function reviewUiSelection(state: ReviewUiState, reviewId: string): ReviewUiSelection {
  return state.byReviewId[reviewId] ?? emptySelection();
}
