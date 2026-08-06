ALTER TYPE "EventType" ADD VALUE 'design_source_pulled';

CREATE TABLE "SessionGroupDesignLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "implementationSessionGroupId" TEXT NOT NULL,
    "designSessionGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionGroupDesignLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionGroupDesignLink_implementationSessionGroupId_designSessionGroupId_key"
ON "SessionGroupDesignLink"("implementationSessionGroupId", "designSessionGroupId");

CREATE INDEX "SessionGroupDesignLink_organizationId_implementationSessionGroupId_idx"
ON "SessionGroupDesignLink"("organizationId", "implementationSessionGroupId");

CREATE INDEX "SessionGroupDesignLink_designSessionGroupId_idx"
ON "SessionGroupDesignLink"("designSessionGroupId");

ALTER TABLE "SessionGroupDesignLink"
ADD CONSTRAINT "SessionGroupDesignLink_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionGroupDesignLink"
ADD CONSTRAINT "SessionGroupDesignLink_implementationSessionGroupId_fkey"
FOREIGN KEY ("implementationSessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionGroupDesignLink"
ADD CONSTRAINT "SessionGroupDesignLink_designSessionGroupId_fkey"
FOREIGN KEY ("designSessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
