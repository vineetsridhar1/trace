-- Step 1: Create OrgMember table
CREATE TABLE "OrgMember" (
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("userId","organizationId")
);

CREATE INDEX "OrgMember_organizationId_idx" ON "OrgMember"("organizationId");

-- Step 2: Backfill OrgMember from existing User data
INSERT INTO "OrgMember" ("userId", "organizationId", "role", "joinedAt")
SELECT "id", "organizationId", "role", "createdAt"
FROM "User"
WHERE "organizationId" IS NOT NULL;

-- Step 3: Drop compound foreign keys and unique constraints that reference User.[id, organizationId]

-- ChatMember: drop compound FK to Chat and User, recreate simple FKs
ALTER TABLE "ChatMember" DROP CONSTRAINT IF EXISTS "ChatMember_chatId_organizationId_fkey";
ALTER TABLE "ChatMember" DROP CONSTRAINT IF EXISTS "ChatMember_userId_organizationId_fkey";

-- Message: drop compound FK to Chat, drop org FK
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_chatId_organizationId_fkey";
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_organizationId_fkey";

-- Chat: drop compound FK to User, drop org FK
ALTER TABLE "Chat" DROP CONSTRAINT IF EXISTS "Chat_createdById_organizationId_fkey";
ALTER TABLE "Chat" DROP CONSTRAINT IF EXISTS "Chat_organizationId_fkey";

-- Participant: drop compound FK to User, make org optional
ALTER TABLE "Participant" DROP CONSTRAINT IF EXISTS "Participant_userId_organizationId_fkey";
ALTER TABLE "Participant" DROP CONSTRAINT IF EXISTS "Participant_organizationId_fkey";

-- Drop compound unique constraints
ALTER TABLE "Chat" DROP CONSTRAINT IF EXISTS "Chat_id_organizationId_key";
ALTER TABLE "Chat" DROP CONSTRAINT IF EXISTS "Chat_organizationId_dmKey_key";

-- Drop User compound unique
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_id_organizationId_key";

-- Step 4: Drop organizationId columns from Chat, Message, ChatMember
ALTER TABLE "ChatMember" DROP COLUMN "organizationId";
ALTER TABLE "Message" DROP COLUMN "organizationId";
ALTER TABLE "Chat" DROP COLUMN "organizationId";

-- Step 5: Drop organizationId and role from User
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_organizationId_fkey";
ALTER TABLE "User" DROP COLUMN "organizationId";
ALTER TABLE "User" DROP COLUMN "role";

-- Step 6: Make Participant.organizationId optional (already nullable in new schema)
ALTER TABLE "Participant" ALTER COLUMN "organizationId" DROP NOT NULL;

-- Step 7: Add new simple foreign keys

-- Chat.createdById -> User.id
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Chat.dmKey unique constraint (globally unique now)
CREATE UNIQUE INDEX "Chat_dmKey_key" ON "Chat"("dmKey");

-- ChatMember -> Chat and User (simple FKs)
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Message -> Chat (simple FK)
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Participant -> User (simple FK)
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Participant -> Organization (optional FK)
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- OrgMember foreign keys
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old Chat organizationId index
DROP INDEX IF EXISTS "Chat_organizationId_idx";

-- Drop old ChatMember organizationId index
DROP INDEX IF EXISTS "ChatMember_organizationId_idx";

-- Drop old Message organizationId index
DROP INDEX IF EXISTS "Message_organizationId_idx";

-- Drop Organization.members reverse relation index (User.organizationId)
-- The Organization no longer has a direct User[] relation
