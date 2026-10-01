ALTER TYPE "ScopeType" ADD VALUE 'review';

CREATE TYPE "ReviewStatus" AS ENUM ('open', 'archived');
CREATE TYPE "ReviewSnapshotStatus" AS ENUM ('current', 'archived');
CREATE TYPE "ReviewThreadScope" AS ENUM ('line', 'file', 'general', 'guide_explanation');
CREATE TYPE "ReviewDeliveryStatus" AS ENUM ('trace_only', 'selected', 'delivered', 'delivery_failed', 'outdated');
CREATE TYPE "ReviewInquirySourceKind" AS ENUM ('guide_generation', 'diff_anchor', 'guide_anchor', 'thread');
CREATE TYPE "ReviewInquiryState" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE "ReviewGuideStatus" AS ENUM ('ready', 'earlier');
CREATE TYPE "ReviewDisposition" AS ENUM ('comment', 'approve', 'request_changes');

ALTER TYPE "EventType" ADD VALUE 'review_opened';
ALTER TYPE "EventType" ADD VALUE 'review_snapshot_created';
ALTER TYPE "EventType" ADD VALUE 'review_snapshot_marked_current';
ALTER TYPE "EventType" ADD VALUE 'review_thread_created';
ALTER TYPE "EventType" ADD VALUE 'review_thread_updated';
ALTER TYPE "EventType" ADD VALUE 'review_comment_created';
ALTER TYPE "EventType" ADD VALUE 'review_thread_resolved';
ALTER TYPE "EventType" ADD VALUE 'review_thread_reanchored';
ALTER TYPE "EventType" ADD VALUE 'review_inquiry_enqueued';
ALTER TYPE "EventType" ADD VALUE 'review_inquiry_started';
ALTER TYPE "EventType" ADD VALUE 'review_inquiry_completed';
ALTER TYPE "EventType" ADD VALUE 'review_inquiry_failed';
ALTER TYPE "EventType" ADD VALUE 'review_inquiry_cancelled';
ALTER TYPE "EventType" ADD VALUE 'review_guide_saved';
ALTER TYPE "EventType" ADD VALUE 'review_guide_failed';
ALTER TYPE "EventType" ADD VALUE 'review_delivery_started';
ALTER TYPE "EventType" ADD VALUE 'review_delivery_succeeded';
ALTER TYPE "EventType" ADD VALUE 'review_delivery_failed';

CREATE TABLE "Review" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "repositoryId" TEXT NOT NULL,
  "channelId" TEXT, "sourceSessionGroupId" TEXT, "attachedSessionId" TEXT NOT NULL,
  "provider" "RepoProvider" NOT NULL, "remotePullRequestId" TEXT NOT NULL,
  "pullRequestNumber" INTEGER NOT NULL, "pullRequestUrl" TEXT NOT NULL, "title" TEXT NOT NULL,
  "status" "ReviewStatus" NOT NULL DEFAULT 'open', "currentSnapshotId" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewSnapshot" (
  "id" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "baseSha" TEXT NOT NULL, "headSha" TEXT NOT NULL,
  "status" "ReviewSnapshotStatus" NOT NULL DEFAULT 'current', "files" JSONB NOT NULL,
  "patchStorageKey" TEXT NOT NULL, "patchChecksum" TEXT NOT NULL, "patchByteLength" INTEGER NOT NULL,
  "diffFormatVersion" INTEGER NOT NULL DEFAULT 1, "providerMetadata" JSONB NOT NULL DEFAULT '{}',
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewThread" (
  "id" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "originSnapshotId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL, "scope" "ReviewThreadScope" NOT NULL, "anchor" JSONB,
  "guideChapterId" TEXT, "resolvedAt" TIMESTAMP(3), "resolvedById" TEXT,
  "deliveryStatus" "ReviewDeliveryStatus" NOT NULL DEFAULT 'trace_only',
  "providerReviewId" TEXT, "providerCommentId" TEXT, "deliveredAt" TIMESTAMP(3),
  "deliveryError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ReviewThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewComment" (
  "id" TEXT NOT NULL, "threadId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "body" TEXT NOT NULL,
  "editedAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3), "providerCommentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewInquiry" (
  "id" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "snapshotId" TEXT NOT NULL, "sessionId" TEXT NOT NULL,
  "sourceKind" "ReviewInquirySourceKind" NOT NULL, "question" TEXT NOT NULL, "anchor" JSONB,
  "context" JSONB NOT NULL DEFAULT '{}', "sessionMessageId" TEXT, "responseMessageId" TEXT,
  "position" INTEGER NOT NULL, "state" "ReviewInquiryState" NOT NULL DEFAULT 'queued', "error" TEXT,
  "structuredResult" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), CONSTRAINT "ReviewInquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewGuide" (
  "id" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "snapshotId" TEXT NOT NULL,
  "generationInquiryId" TEXT NOT NULL, "status" "ReviewGuideStatus" NOT NULL DEFAULT 'ready',
  "title" TEXT NOT NULL, "intent" TEXT NOT NULL, "content" JSONB NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ReviewGuide_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewDelivery" (
  "id" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "snapshotId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL, "disposition" "ReviewDisposition" NOT NULL, "threadIds" JSONB NOT NULL,
  "body" TEXT, "status" TEXT NOT NULL DEFAULT 'pending', "providerReviewId" TEXT,
  "providerCommentIds" JSONB, "attempts" INTEGER NOT NULL DEFAULT 0, "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "ReviewDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Review_currentSnapshotId_key" ON "Review"("currentSnapshotId");
CREATE UNIQUE INDEX "Review_org_provider_pr_group_key" ON "Review"("organizationId", "provider", "remotePullRequestId", "sourceSessionGroupId");
CREATE INDEX "Review_organizationId_updatedAt_idx" ON "Review"("organizationId", "updatedAt");
CREATE INDEX "Review_sourceSessionGroupId_idx" ON "Review"("sourceSessionGroupId");
CREATE INDEX "Review_attachedSessionId_idx" ON "Review"("attachedSessionId");
CREATE UNIQUE INDEX "ReviewSnapshot_reviewId_baseSha_headSha_key" ON "ReviewSnapshot"("reviewId", "baseSha", "headSha");
CREATE INDEX "ReviewSnapshot_reviewId_createdAt_idx" ON "ReviewSnapshot"("reviewId", "createdAt");
CREATE INDEX "ReviewThread_reviewId_createdAt_idx" ON "ReviewThread"("reviewId", "createdAt");
CREATE INDEX "ReviewThread_originSnapshotId_idx" ON "ReviewThread"("originSnapshotId");
CREATE INDEX "ReviewComment_threadId_createdAt_idx" ON "ReviewComment"("threadId", "createdAt");
CREATE UNIQUE INDEX "ReviewInquiry_sessionMessageId_key" ON "ReviewInquiry"("sessionMessageId");
CREATE UNIQUE INDEX "ReviewInquiry_responseMessageId_key" ON "ReviewInquiry"("responseMessageId");
CREATE UNIQUE INDEX "ReviewInquiry_reviewId_position_key" ON "ReviewInquiry"("reviewId", "position");
CREATE INDEX "ReviewInquiry_reviewId_state_position_idx" ON "ReviewInquiry"("reviewId", "state", "position");
CREATE INDEX "ReviewInquiry_sessionId_state_idx" ON "ReviewInquiry"("sessionId", "state");
CREATE UNIQUE INDEX "ReviewGuide_generationInquiryId_key" ON "ReviewGuide"("generationInquiryId");
CREATE UNIQUE INDEX "ReviewGuide_snapshotId_version_key" ON "ReviewGuide"("snapshotId", "version");
CREATE INDEX "ReviewGuide_reviewId_createdAt_idx" ON "ReviewGuide"("reviewId", "createdAt");
CREATE UNIQUE INDEX "ReviewDelivery_idempotencyKey_key" ON "ReviewDelivery"("idempotencyKey");
CREATE INDEX "ReviewDelivery_reviewId_createdAt_idx" ON "ReviewDelivery"("reviewId", "createdAt");

ALTER TABLE "Review" ADD CONSTRAINT "Review_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_sourceSessionGroupId_fkey" FOREIGN KEY ("sourceSessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_attachedSessionId_fkey" FOREIGN KEY ("attachedSessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewSnapshot" ADD CONSTRAINT "ReviewSnapshot_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewSnapshot" ADD CONSTRAINT "ReviewSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_currentSnapshotId_fkey" FOREIGN KEY ("currentSnapshotId") REFERENCES "ReviewSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewThread" ADD CONSTRAINT "ReviewThread_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewThread" ADD CONSTRAINT "ReviewThread_originSnapshotId_fkey" FOREIGN KEY ("originSnapshotId") REFERENCES "ReviewSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewThread" ADD CONSTRAINT "ReviewThread_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewThread" ADD CONSTRAINT "ReviewThread_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ReviewThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewInquiry" ADD CONSTRAINT "ReviewInquiry_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewInquiry" ADD CONSTRAINT "ReviewInquiry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReviewSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewInquiry" ADD CONSTRAINT "ReviewInquiry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewInquiry" ADD CONSTRAINT "ReviewInquiry_sessionMessageId_fkey" FOREIGN KEY ("sessionMessageId") REFERENCES "SessionMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewInquiry" ADD CONSTRAINT "ReviewInquiry_responseMessageId_fkey" FOREIGN KEY ("responseMessageId") REFERENCES "SessionMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewGuide" ADD CONSTRAINT "ReviewGuide_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewGuide" ADD CONSTRAINT "ReviewGuide_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReviewSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewGuide" ADD CONSTRAINT "ReviewGuide_generationInquiryId_fkey" FOREIGN KEY ("generationInquiryId") REFERENCES "ReviewInquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewDelivery" ADD CONSTRAINT "ReviewDelivery_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewDelivery" ADD CONSTRAINT "ReviewDelivery_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReviewSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
