import { gql } from "@urql/core";
import type { Review } from "@trace/gql";
import { useEntityStore } from "@trace/client-core";
import { client } from "../../lib/urql";

export const REVIEW_FIELDS = gql`
  fragment ReviewWorkspaceFields on Review {
    id
    organizationId
    repositoryId
    channelId
    sourceSessionGroupId
    attachedSessionId
    provider
    remotePullRequestId
    pullRequestNumber
    pullRequestUrl
    title
    status
    currentSnapshotId
    createdAt
    updatedAt
    repository {
      id
      name
      remoteUrl
    }
    currentSnapshot {
      id
      reviewId
      baseSha
      headSha
      status
      files {
        path
        previousPath
        status
        additions
        deletions
        patchAvailable
        viewed
        commentCount
      }
      patchChecksum
      patchByteLength
      diffFormatVersion
      providerMetadata
      createdById
      createdAt
    }
    snapshots {
      id
      reviewId
      baseSha
      headSha
      status
      files {
        path
        previousPath
        status
        additions
        deletions
        patchAvailable
        viewed
        commentCount
      }
      patchChecksum
      patchByteLength
      diffFormatVersion
      providerMetadata
      createdById
      createdAt
    }
    threads {
      id
      reviewId
      originSnapshotId
      authorId
      scope
      guideChapterId
      resolvedAt
      resolvedById
      deliveryStatus
      providerReviewId
      providerCommentId
      deliveredAt
      deliveryError
      createdAt
      updatedAt
      author {
        id
        name
        email
        avatarUrl
      }
      anchor {
        snapshotId
        filePath
        side
        startLine
        endLine
        originalLine
        selectedText
        context
        hunkId
        baseBlobId
        headBlobId
        status
      }
      comments {
        id
        threadId
        authorId
        body
        editedAt
        deletedAt
        providerCommentId
        createdAt
        updatedAt
        author {
          id
          name
          email
          avatarUrl
        }
      }
    }
    inquiries {
      id
      reviewId
      snapshotId
      sessionId
      sourceKind
      question
      anchor
      context
      sessionMessageId
      responseMessageId
      position
      state
      error
      structuredResult
      createdAt
      startedAt
      completedAt
      responseMessage {
        id
        sessionId
        role
        text
        content
        attachments
        sourceEventId
        createdAt
      }
    }
    guides {
      id
      reviewId
      snapshotId
      generationInquiryId
      status
      title
      intent
      content
      version
      createdAt
    }
  }
`;

export const REVIEW_QUERY = gql`
  query ReviewWorkspace($id: ID!) {
    review(id: $id) {
      ...ReviewWorkspaceFields
    }
  }
  ${REVIEW_FIELDS}
`;

export const REVIEW_FOR_GROUP_QUERY = gql`
  query ReviewForSessionGroup($sessionGroupId: ID!) {
    reviewForSessionGroup(sessionGroupId: $sessionGroupId) {
      ...ReviewWorkspaceFields
    }
  }
  ${REVIEW_FIELDS}
`;

export function normalizeReview(review: Review): void {
  const store = useEntityStore.getState();
  store.upsert("reviews", review.id, review);
  store.upsertMany("reviewSnapshots", review.snapshots);
  store.upsertMany("reviewThreads", review.threads);
  store.upsertMany("reviewInquiries", review.inquiries);
  store.upsertMany("reviewGuides", review.guides);
  for (const thread of review.threads) store.upsertMany("reviewComments", thread.comments);
}

export async function fetchReview(reviewId: string): Promise<Review> {
  const result = await client
    .query(REVIEW_QUERY, { id: reviewId }, { requestPolicy: "network-only" })
    .toPromise();
  if (result.error) throw result.error;
  const review = result.data?.review as Review | null | undefined;
  if (!review) throw new Error("Review not found");
  normalizeReview(review);
  return review;
}

export async function fetchReviewForGroup(sessionGroupId: string): Promise<Review | null> {
  const result = await client
    .query(REVIEW_FOR_GROUP_QUERY, { sessionGroupId }, { requestPolicy: "network-only" })
    .toPromise();
  if (result.error) throw result.error;
  const review = result.data?.reviewForSessionGroup as Review | null | undefined;
  if (review) normalizeReview(review);
  return review ?? null;
}

export async function mutateReview<T>(
  document: ReturnType<typeof gql>,
  variables: Record<string, unknown>,
): Promise<T> {
  const result = await client.mutation(document, variables).toPromise();
  if (result.error) throw result.error;
  return result.data as T;
}
