-- Ambient Agent Memory System Migration
-- Phases 0-4: Replay infrastructure, soul files, derived memory, embeddings

-- Phase 0A: Add replayPacket and promptVersions to AgentExecutionLog
ALTER TABLE "AgentExecutionLog" ADD COLUMN "replayPacket" JSONB;
ALTER TABLE "AgentExecutionLog" ADD COLUMN "promptVersions" JSONB;

-- Phase 1A: Add soulFile to Project
ALTER TABLE "Project" ADD COLUMN "soulFile" TEXT NOT NULL DEFAULT '';

-- Phase 2A: Create MemoryKind enum
CREATE TYPE "MemoryKind" AS ENUM ('fact', 'preference', 'decision', 'pattern', 'relationship');

-- Phase 2A: Create DerivedMemory table
CREATE TABLE "DerivedMemory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "sourceScopeType" "ScopeType" NOT NULL,
    "sourceScopeId" TEXT NOT NULL,
    "sourceIsDm" BOOLEAN NOT NULL DEFAULT false,
    "startEventId" TEXT NOT NULL,
    "endEventId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'auto',
    "content" TEXT NOT NULL,
    "structuredData" JSONB NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "supersededBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DerivedMemory_pkey" PRIMARY KEY ("id")
);

-- Phase 2A: DerivedMemory indexes
CREATE INDEX "DerivedMemory_organizationId_subjectType_subjectId_idx" ON "DerivedMemory"("organizationId", "subjectType", "subjectId");
CREATE INDEX "DerivedMemory_organizationId_sourceScopeType_sourceScopeId_idx" ON "DerivedMemory"("organizationId", "sourceScopeType", "sourceScopeId");
CREATE INDEX "DerivedMemory_organizationId_kind_idx" ON "DerivedMemory"("organizationId", "kind");
CREATE INDEX "DerivedMemory_organizationId_validTo_idx" ON "DerivedMemory"("organizationId", "validTo");
CREATE INDEX "DerivedMemory_startEventId_idx" ON "DerivedMemory"("startEventId");
CREATE INDEX "DerivedMemory_endEventId_idx" ON "DerivedMemory"("endEventId");

-- Phase 2A: DerivedMemory foreign key
ALTER TABLE "DerivedMemory" ADD CONSTRAINT "DerivedMemory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 4A: pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Phase 4A: Add embedding columns
ALTER TABLE "DerivedMemory" ADD COLUMN "embedding" vector(1536);
ALTER TABLE "EntitySummary" ADD COLUMN "embedding" vector(1536);

-- Phase 4A: Vector indexes for cosine similarity search
CREATE INDEX "DerivedMemory_embedding_idx"
ON "DerivedMemory"
USING ivfflat ("embedding" vector_cosine_ops)
WITH (lists = 100)
WHERE "embedding" IS NOT NULL;

CREATE INDEX "EntitySummary_embedding_idx"
ON "EntitySummary"
USING ivfflat ("embedding" vector_cosine_ops)
WITH (lists = 100)
WHERE "embedding" IS NOT NULL;
