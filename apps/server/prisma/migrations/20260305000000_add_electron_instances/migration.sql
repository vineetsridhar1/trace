-- CreateTable
CREATE TABLE "electron_instances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "server_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "electron_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "electron_instances_user_id_idx" ON "electron_instances"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "electron_instances_user_id_name_key" ON "electron_instances"("user_id", "name");

-- AddForeignKey
ALTER TABLE "electron_instances" ADD CONSTRAINT "electron_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electron_instances" ADD CONSTRAINT "electron_instances_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
