-- DropForeignKey
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_message_id_fkey";

-- AlterTable
ALTER TABLE "tickets" ALTER COLUMN "message_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
