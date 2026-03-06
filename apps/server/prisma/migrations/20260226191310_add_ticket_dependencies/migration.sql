-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "queued_run_config" JSONB;

-- CreateTable
CREATE TABLE "ticket_dependencies" (
    "id" TEXT NOT NULL,
    "ticket_message_id" TEXT NOT NULL,
    "depends_on_message_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_dependencies_depends_on_message_id_idx" ON "ticket_dependencies"("depends_on_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_dependencies_ticket_message_id_depends_on_message_id_key" ON "ticket_dependencies"("ticket_message_id", "depends_on_message_id");

-- AddForeignKey
ALTER TABLE "ticket_dependencies" ADD CONSTRAINT "ticket_dependencies_ticket_message_id_fkey" FOREIGN KEY ("ticket_message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_dependencies" ADD CONSTRAINT "ticket_dependencies_depends_on_message_id_fkey" FOREIGN KEY ("depends_on_message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
