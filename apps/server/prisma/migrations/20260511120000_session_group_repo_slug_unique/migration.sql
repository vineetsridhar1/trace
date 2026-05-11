WITH duplicate_session_group_slugs AS (
  SELECT
    "id",
    "slug",
    ROW_NUMBER() OVER (
      PARTITION BY "repoId", "slug"
      ORDER BY
        CASE WHEN "workdir" IS NOT NULL THEN 0 ELSE 1 END,
        "createdAt",
        "id"
    ) AS duplicate_rank
  FROM "SessionGroup"
  WHERE "repoId" IS NOT NULL
    AND "slug" IS NOT NULL
),
session_group_slug_renames AS (
  SELECT
    "id",
    "slug" || '-' || "id" AS "slug"
  FROM duplicate_session_group_slugs
  WHERE duplicate_rank > 1
)
UPDATE "SessionGroup"
SET "slug" = session_group_slug_renames."slug"
FROM session_group_slug_renames
WHERE "SessionGroup"."id" = session_group_slug_renames."id";

CREATE UNIQUE INDEX "SessionGroup_repoId_slug_key" ON "SessionGroup"("repoId", "slug");
