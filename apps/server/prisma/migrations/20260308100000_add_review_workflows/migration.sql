-- CreateTable
CREATE TABLE "review_workflows" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_agents" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "max_tokens" INTEGER,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_runs" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input" JSONB NOT NULL,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_steps" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "review" JSONB,
    "raw_response" TEXT,
    "tokens_used" INTEGER,
    "cost_cents" DOUBLE PRECISION,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_workflows_channel_id_idx" ON "review_workflows"("channel_id");

-- CreateIndex
CREATE INDEX "review_agents_workflow_id_sort_order_idx" ON "review_agents"("workflow_id", "sort_order");

-- CreateIndex
CREATE INDEX "review_runs_workflow_id_created_at_idx" ON "review_runs"("workflow_id", "created_at");

-- CreateIndex
CREATE INDEX "review_runs_workspace_id_idx" ON "review_runs"("workspace_id");

-- CreateIndex
CREATE INDEX "review_steps_run_id_idx" ON "review_steps"("run_id");

-- CreateIndex
CREATE INDEX "review_steps_agent_id_idx" ON "review_steps"("agent_id");

-- AddForeignKey
ALTER TABLE "review_workflows" ADD CONSTRAINT "review_workflows_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_agents" ADD CONSTRAINT "review_agents_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "review_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_runs" ADD CONSTRAINT "review_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "review_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_runs" ADD CONSTRAINT "review_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_steps" ADD CONSTRAINT "review_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "review_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_steps" ADD CONSTRAINT "review_steps_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "review_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
