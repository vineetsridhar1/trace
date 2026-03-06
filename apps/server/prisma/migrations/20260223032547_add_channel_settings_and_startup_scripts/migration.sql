-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "cwd" TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "startup_scripts" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "startup_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "startup_scripts_channel_id_sort_order_idx" ON "startup_scripts"("channel_id", "sort_order");

-- AddForeignKey
ALTER TABLE "startup_scripts" ADD CONSTRAINT "startup_scripts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
