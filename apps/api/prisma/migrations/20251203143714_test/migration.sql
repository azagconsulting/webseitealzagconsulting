/*
  Warnings:

  - The values [SPAM] on the enum `CustomerMessage_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `customermessage` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    MODIFY `status` ENUM('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'SENT',
    MODIFY `readAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `CustomerMessage_tenantId_deletedAt_idx` ON `CustomerMessage`(`tenantId`, `deletedAt`);
