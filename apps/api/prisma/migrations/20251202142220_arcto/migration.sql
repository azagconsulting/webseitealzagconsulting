/*
  Warnings:

  - The values [SPAM] on the enum `CustomerMessage_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `customermessage` ADD COLUMN `isSpam` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `status` ENUM('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'SENT',
    MODIFY `readAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `CustomerMessage_tenantId_isSpam_createdAt_idx` ON `CustomerMessage`(`tenantId`, `isSpam`, `createdAt`);
