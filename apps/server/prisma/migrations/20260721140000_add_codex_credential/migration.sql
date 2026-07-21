CREATE TYPE "CodexAuthMethod" AS ENUM ('chatgpt_session', 'access_token', 'api_key');

CREATE TABLE "CodexCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "method" "CodexAuthMethod" NOT NULL,
  "encryptedCredential" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CodexCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CodexCredential_userId_key" ON "CodexCredential"("userId");
ALTER TABLE "CodexCredential" ADD CONSTRAINT "CodexCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
