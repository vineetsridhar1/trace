ALTER TABLE "SessionSetupScriptRun" ALTER COLUMN "repoId" DROP NOT NULL;
ALTER TABLE "SessionApplicationProcess" ALTER COLUMN "repoId" DROP NOT NULL;
ALTER TABLE "SessionEndpoint" ALTER COLUMN "repoId" DROP NOT NULL;
