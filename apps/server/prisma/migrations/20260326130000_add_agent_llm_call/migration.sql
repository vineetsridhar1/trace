-- CreateTable
CREATE TABLE "AgentLlmCall" (
    "id" TEXT NOT NULL,
    "executionLogId" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "systemPrompt" TEXT,
    "messages" JSONB NOT NULL,
    "tools" JSONB NOT NULL DEFAULT '[]',
    "maxTokens" INTEGER,
    "temperature" DOUBLE PRECISION,
    "responseContent" JSONB NOT NULL,
    "stopReason" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "estimatedCostCents" DOUBLE PRECISION NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLlmCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentLlmCall_executionLogId_turnNumber_idx" ON "AgentLlmCall"("executionLogId", "turnNumber");

-- CreateIndex
CREATE INDEX "AgentLlmCall_createdAt_idx" ON "AgentLlmCall"("createdAt");

-- AddForeignKey
ALTER TABLE "AgentLlmCall" ADD CONSTRAINT "AgentLlmCall_executionLogId_fkey" FOREIGN KEY ("executionLogId") REFERENCES "AgentExecutionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
