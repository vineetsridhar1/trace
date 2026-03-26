-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "vector" vector(1536) NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Embedding_entityType_entityId_key" ON "Embedding"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Embedding_organizationId_entityType_idx" ON "Embedding"("organizationId", "entityType");

-- CreateIndex (HNSW for fast approximate nearest neighbor search)
CREATE INDEX "Embedding_vector_idx" ON "Embedding"
USING hnsw ("vector" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
