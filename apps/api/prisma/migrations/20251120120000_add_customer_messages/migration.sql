-- CreateTable
CREATE TABLE `CustomerMessage` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `contactId` VARCHAR(191) NULL,
    `direction` ENUM('INBOUND', 'OUTBOUND') NOT NULL,
    `status` ENUM('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'SENT',
    `subject` VARCHAR(191) NULL,
    `preview` VARCHAR(255) NULL,
    `body` TEXT NOT NULL,
    `fromEmail` VARCHAR(191) NULL,
    `toEmail` VARCHAR(191) NULL,
    `externalId` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NULL,
    `receivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CustomerMessage_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `CustomerMessage_contactId_idx`(`contactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CustomerMessage` ADD CONSTRAINT `CustomerMessage_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerMessage` ADD CONSTRAINT `CustomerMessage_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `CustomerContact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
