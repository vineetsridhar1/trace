/*
  Warnings:

  - The values [default,announcement,triage,feed] on the enum `ChannelType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ChannelType_new" AS ENUM ('text', 'coding');
ALTER TABLE "public"."Channel" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Channel" ALTER COLUMN "type" TYPE "ChannelType_new" USING ("type"::text::"ChannelType_new");
ALTER TYPE "ChannelType" RENAME TO "ChannelType_old";
ALTER TYPE "ChannelType_new" RENAME TO "ChannelType";
DROP TYPE "public"."ChannelType_old";
ALTER TABLE "Channel" ALTER COLUMN "type" SET DEFAULT 'coding';
COMMIT;
