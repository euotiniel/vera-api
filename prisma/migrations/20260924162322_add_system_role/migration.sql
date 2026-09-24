-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('USER', 'PLATFORM_ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "systemRole" "SystemRole" NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX "User_systemRole_idx" ON "User"("systemRole");
