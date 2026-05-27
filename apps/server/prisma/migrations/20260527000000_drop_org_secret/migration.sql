-- DropForeignKey
ALTER TABLE "OrgSecret" DROP CONSTRAINT IF EXISTS "OrgSecret_organizationId_fkey";

-- DropTable
DROP TABLE IF EXISTS "OrgSecret";

-- Strip the now-defunct auth.secretId field from any existing provisioned agent
-- environment configs. The launcher token is now sourced from the
-- TRACE_CLOUD_LAUNCHER_TOKEN env var, so the reference is dead data.
UPDATE "AgentEnvironment"
SET "config" = jsonb_set("config", '{auth}', ("config"->'auth') - 'secretId')
WHERE "config" ? 'auth'
  AND jsonb_typeof("config"->'auth') = 'object'
  AND "config"->'auth' ? 'secretId';
