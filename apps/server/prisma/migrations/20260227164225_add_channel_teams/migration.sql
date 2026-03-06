-- CreateTable
CREATE TABLE "channel_teams" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,

    CONSTRAINT "channel_teams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_teams_channel_id_team_id_key" ON "channel_teams"("channel_id", "team_id");

-- AddForeignKey
ALTER TABLE "channel_teams" ADD CONSTRAINT "channel_teams_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_teams" ADD CONSTRAINT "channel_teams_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
