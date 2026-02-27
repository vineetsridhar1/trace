-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'project',
ADD COLUMN     "workspaces_enabled" BOOLEAN NOT NULL DEFAULT true;
