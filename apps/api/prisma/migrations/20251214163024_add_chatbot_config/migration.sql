/*
  Warnings:

  - The values [SPAM] on the enum `CustomerMessage_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `customermessage` MODIFY `status` ENUM('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'SENT',
    MODIFY `readAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `drivefile` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `workspaceprofile` MODIFY `mission` VARCHAR(191) NULL,
    MODIFY `vision` VARCHAR(191) NULL,
    MODIFY `description` VARCHAR(191) NULL,
    ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateTable
CREATE TABLE `ChatbotConfig` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `apiKey` VARCHAR(255) NULL,
    `knowledgeBase` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ChatbotConfig_tenantId_key`(`tenantId`),
    INDEX `ChatbotConfig_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatbotConfig` ADD CONSTRAINT `ChatbotConfig_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
