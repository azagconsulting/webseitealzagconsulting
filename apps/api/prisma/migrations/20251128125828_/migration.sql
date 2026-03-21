/*
  Warnings:

  - The values [SPAM] on the enum `CustomerMessage_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `customermessage` MODIFY `status` ENUM('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'SENT',
    MODIFY `readAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `TrackingSession` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sessionKey` VARCHAR(191) NOT NULL,
    `trafficSource` ENUM('DIRECT', 'ORGANIC', 'REFERRAL') NOT NULL DEFAULT 'DIRECT',
    `referrer` VARCHAR(512) NULL,
    `utmSource` VARCHAR(120) NULL,
    `utmMedium` VARCHAR(120) NULL,
    `firstPage` VARCHAR(255) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TrackingSession_tenantId_trafficSource_idx`(`tenantId`, `trafficSource`),
    INDEX `TrackingSession_tenantId_lastSeenAt_idx`(`tenantId`, `lastSeenAt`),
    UNIQUE INDEX `TrackingSession_tenantId_sessionKey_key`(`tenantId`, `sessionKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrackingEvent` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `type` ENUM('PAGE_VIEW', 'PAGE_EXIT', 'CLICK') NOT NULL,
    `path` VARCHAR(255) NOT NULL,
    `label` VARCHAR(255) NULL,
    `durationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TrackingEvent_tenantId_path_type_createdAt_idx`(`tenantId`, `path`, `type`, `createdAt`),
    INDEX `TrackingEvent_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TrackingSession` ADD CONSTRAINT `TrackingSession_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrackingEvent` ADD CONSTRAINT `TrackingEvent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrackingEvent` ADD CONSTRAINT `TrackingEvent_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `TrackingSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
