-- DropIndex (replaced by unique constraint on server_id alone)
DROP INDEX IF EXISTS "electron_instances_user_id_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "electron_instances_server_id_key" ON "electron_instances"("server_id");
