/*
  Warnings:

  - The values [SPAM] on the enum `CustomerMessage_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- Ensure readAt exists before altering status/index (MySQL without IF NOT EXISTS)
ALTER TABLE `CustomerMessage` ADD COLUMN `readAt` DATETIME(3) NULL;

-- Alter status enum
ALTER TABLE `CustomerMessage`
  MODIFY `status` ENUM('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'SENT';

-- CreateIndex
CREATE INDEX `CustomerMessage_tenantId_direction_createdAt_idx` ON `CustomerMessage`(`tenantId`, `direction`, `createdAt`);
