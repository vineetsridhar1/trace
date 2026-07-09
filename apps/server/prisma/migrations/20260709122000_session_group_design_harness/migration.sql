ALTER TABLE "SessionGroup" ADD COLUMN "designSystemId" TEXT;
ALTER TABLE "SessionGroup" ADD COLUMN "designSkillIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
