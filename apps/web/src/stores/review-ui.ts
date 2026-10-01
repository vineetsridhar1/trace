import { create } from "zustand";

export type ReviewView = "changes" | "guide";

export interface ReviewHighlight {
  filePath: string;
  startLine: number;
  endLine: number;
}

interface ReviewUiSelection {
  view: ReviewView;
  guideInstructions: string | null;
  activeFilePath: string | null;
  /** Set to ask the Changes view to scroll; cleared once it has. */
  requestedFilePath: string | null;
  requestedLine: number | null;
  /** The range the Guide or a thread last pointed at, kept lit until something else is chosen. */
  highlight: ReviewHighlight | null;
  /** Missing entries use file metadata defaults; explicit choices survive virtualized remounts. */
  fileCollapsedOverrides: Record<string, boolean>;
  inquiryCollapsedOverrides: Record<string, boolean>;
}

interface ReviewUiState {
  /** Drafts survive virtualized thread cards leaving the viewport. */
  replyDrafts: Record<string, string>;
  setReplyDraft(threadId: string, body: string): void;
  deletedInquiryIds: string[];
  deleteInquiry(inquiryId: string): void;
  byReviewId: Record<string, ReviewUiSelection>;
  patch(reviewId: string, value: Partial<ReviewUiSelection>): void;
  navigate(reviewId: string, highlight: ReviewHighlight): void;
  toggleFileCollapsed(reviewId: string, filePath: string, defaultCollapsed?: boolean): void;
  setInquiryCollapsed(reviewId: string, inquiryId: string, collapsed: boolean): void;
  toggleInquiryCollapsed(reviewId: string, inquiryId: string, defaultCollapsed?: boolean): void;
}

const emptySelection = (): ReviewUiSelection => ({
  view: "changes",
  guideInstructions: null,
  activeFilePath: null,
  requestedFilePath: null,
  requestedLine: null,
  highlight: null,
  fileCollapsedOverrides: {},
  inquiryCollapsedOverrides: {},
});

const DELETED_INQUIRIES_KEY = "trace.review.deleted-inquiries.v1";

function deletedInquiries(): string[] {
  try {
    const value: unknown = JSON.parse(
      globalThis.localStorage?.getItem(DELETED_INQUIRIES_KEY) ?? "[]",
    );
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export const useReviewUiStore = create<ReviewUiState>((set) => ({
  replyDrafts: {},
  setReplyDraft: (threadId, body) =>
    set((state) => {
      const replyDrafts = { ...state.replyDrafts };
      if (body) replyDrafts[threadId] = body;
      else delete replyDrafts[threadId];
      return { replyDrafts };
    }),
  deletedInquiryIds: deletedInquiries(),
  deleteInquiry: (inquiryId) =>
    set((state) => {
      if (state.deletedInquiryIds.includes(inquiryId)) return state;
      const deletedInquiryIds = [...state.deletedInquiryIds, inquiryId];
      try {
        globalThis.localStorage?.setItem(DELETED_INQUIRIES_KEY, JSON.stringify(deletedInquiryIds));
      } catch {
        // Still dismiss locally when browser storage is unavailable.
      }
      return { deletedInquiryIds };
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
  setInquiryCollapsed: (reviewId, inquiryId, collapsed) =>
    set((state) => {
      const current = state.byReviewId[reviewId] ?? emptySelection();
      return {
        byReviewId: {
          ...state.byReviewId,
          [reviewId]: {
            ...current,
            inquiryCollapsedOverrides: {
              ...current.inquiryCollapsedOverrides,
              [inquiryId]: collapsed,
            },
          },
        },
      };
    }),
  toggleInquiryCollapsed: (reviewId, inquiryId, defaultCollapsed = false) =>
    set((state) => {
      const current = state.byReviewId[reviewId] ?? emptySelection();
      const collapsed = current.inquiryCollapsedOverrides[inquiryId] ?? defaultCollapsed;
      return {
        byReviewId: {
          ...state.byReviewId,
          [reviewId]: {
            ...current,
            inquiryCollapsedOverrides: {
              ...current.inquiryCollapsedOverrides,
              [inquiryId]: !collapsed,
            },
          },
        },
      };
    }),
}));

export function reviewUiSelection(state: ReviewUiState, reviewId: string): ReviewUiSelection {
  return state.byReviewId[reviewId] ?? emptySelection();
}
