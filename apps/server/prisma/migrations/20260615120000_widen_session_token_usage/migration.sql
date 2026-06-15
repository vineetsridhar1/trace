ALTER TABLE "Session"
  ALTER COLUMN "inputTokens" TYPE BIGINT,
  ALTER COLUMN "outputTokens" TYPE BIGINT,
  ALTER COLUMN "cacheReadTokens" TYPE BIGINT,
  ALTER COLUMN "cacheCreationTokens" TYPE BIGINT;
