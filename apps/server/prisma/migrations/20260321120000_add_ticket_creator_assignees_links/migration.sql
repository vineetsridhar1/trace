-- AlterEnum: add new EventType values
ALTER TYPE "EventType" ADD VALUE 'ticket_assigned';
ALTER TYPE "EventType" ADD VALUE 'ticket_unassigned';
ALTER TYPE "EventType" ADD VALUE 'ticket_linked';
ALTER TYPE "EventType" ADD VALUE 'ticket_unlinked';

-- Add createdById to Ticket — nullable first, then backfill, then NOT NULL
ALTER TABLE "Ticket" ADD COLUMN "createdById" TEXT;

-- Backfill: assign existing tickets to the first admin in their org (or first member)
UPDATE "Ticket" t
SET "createdById" = (
  SELECT u."id" FROM "User" u
  WHERE u."organizationId" = t."organizationId"
  ORDER BY u."role" = 'admin' DESC, u."createdAt" ASC
  LIMIT 1
)
WHERE t."createdById" IS NULL;

-- Now enforce NOT NULL
ALTER TABLE "Ticket" ALTER COLUMN "createdById" SET NOT NULL;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: TicketAssignee
CREATE TABLE "TicketAssignee" (
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAssignee_pkey" PRIMARY KEY ("ticketId","userId")
);

ALTER TABLE "TicketAssignee" ADD CONSTRAINT "TicketAssignee_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketAssignee" ADD CONSTRAINT "TicketAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: TicketLink
CREATE TABLE "TicketLink" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketLink_ticketId_entityType_entityId_key" ON "TicketLink"("ticketId", "entityType", "entityId");
CREATE INDEX "TicketLink_entityType_entityId_idx" ON "TicketLink"("entityType", "entityId");

ALTER TABLE "TicketLink" ADD CONSTRAINT "TicketLink_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing SessionTicket data to TicketLink
INSERT INTO "TicketLink" ("id", "ticketId", "entityType", "entityId")
SELECT gen_random_uuid(), "ticketId", 'session', "sessionId"
FROM "SessionTicket";

-- DropTable: SessionTicket
DROP TABLE "SessionTicket";
