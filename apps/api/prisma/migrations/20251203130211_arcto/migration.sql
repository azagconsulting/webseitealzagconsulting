/*
  Warnings:

  - The values [SPAM] on the enum `CustomerMessage_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `customermessage` ADD COLUMN `ownerUserId` VARCHAR(191) NULL,
    MODIFY `status` ENUM('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'SENT',
    MODIFY `readAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `CustomerMessage_tenantId_ownerUserId_idx` ON `CustomerMessage`(`tenantId`, `ownerUserId`);

-- AddForeignKey
ALTER TABLE `CustomerMessage` ADD CONSTRAINT `CustomerMessage_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
