import { create } from "zustand";

export type ReviewView = "changes" | "guide";

export interface ReviewHighlight {
  filePath: string;
  startLine: number;
  endLine: number;
}

interface ReviewUiSelection {
  view: ReviewView;
  activeFilePath: string | null;
  /** Set to ask the Changes view to scroll; cleared once it has. */
  requestedFilePath: string | null;
  requestedLine: number | null;
  /** The range the Guide or a thread last pointed at, kept lit until something else is chosen. */
  highlight: ReviewHighlight | null;
  /** Missing entries use file metadata defaults; explicit choices survive virtualized remounts. */
  fileCollapsedOverrides: Record<string, boolean>;
  collapsedInquiryIds: string[];
}

interface ReviewUiState {
  /** Drafts survive virtualized thread cards leaving the viewport. */
  replyDrafts: Record<string, string>;
  setReplyDraft(threadId: string, body: string): void;
  byReviewId: Record<string, ReviewUiSelection>;
  patch(reviewId: string, value: Partial<ReviewUiSelection>): void;
  navigate(reviewId: string, highlight: ReviewHighlight): void;
  toggleFileCollapsed(reviewId: string, filePath: string, defaultCollapsed?: boolean): void;
  toggleInquiryCollapsed(reviewId: string, inquiryId: string): void;
}

const emptySelection = (): ReviewUiSelection => ({
  view: "changes",
  activeFilePath: null,
  requestedFilePath: null,
  requestedLine: null,
  highlight: null,
  fileCollapsedOverrides: {},
  collapsedInquiryIds: [],
});

export const useReviewUiStore = create<ReviewUiState>((set) => ({
  replyDrafts: {},
  setReplyDraft: (threadId, body) =>
    set((state) => {
      const replyDrafts = { ...state.replyDrafts };
      if (body) replyDrafts[threadId] = body;
      else delete replyDrafts[threadId];
      return { replyDrafts };
    }),
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
            fileCollapsedOverrides: {
              ...current.fileCollapsedOverrides,
              [highlight.filePath]: false,
            },
          },
        },
      };
    }),
  toggleFileCollapsed: (reviewId, filePath, defaultCollapsed = false) =>
    set((state) => {
      const current = state.byReviewId[reviewId] ?? emptySelection();
      const collapsed = current.fileCollapsedOverrides[filePath] ?? defaultCollapsed;
      return {
        byReviewId: {
          ...state.byReviewId,
          [reviewId]: {
            ...current,
            fileCollapsedOverrides: { ...current.fileCollapsedOverrides, [filePath]: !collapsed },
          },
        },
      };
    }),
  toggleInquiryCollapsed: (reviewId, inquiryId) =>
    set((state) => {
      const current = state.byReviewId[reviewId] ?? emptySelection();
      const collapsed = current.collapsedInquiryIds.includes(inquiryId);
      return {
        byReviewId: {
          ...state.byReviewId,
          [reviewId]: {
            ...current,
            collapsedInquiryIds: collapsed
              ? current.collapsedInquiryIds.filter((id) => id !== inquiryId)
              : [...current.collapsedInquiryIds, inquiryId],
          },
        },
      };
    }),
}));

export function reviewUiSelection(state: ReviewUiState, reviewId: string): ReviewUiSelection {
  return state.byReviewId[reviewId] ?? emptySelection();
}
