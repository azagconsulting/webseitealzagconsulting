/*
  Warnings:

  - You are about to drop the column `decisionStage` on the `customer` table. All the data in the column will be lost.
  - You are about to drop the column `health` on the `customer` table. All the data in the column will be lost.
  - You are about to drop the column `mrrCents` on the `customer` table. All the data in the column will be lost.
  - You are about to drop the column `nextStep` on the `customer` table. All the data in the column will be lost.
  - You are about to drop the column `nextStepDueAt` on the `customer` table. All the data in the column will be lost.
  - You are about to drop the column `ownerName` on the `customer` table. All the data in the column will be lost.
  - You are about to drop the column `region` on the `customer` table. All the data in the column will be lost.
  - You are about to drop the column `segment` on the `customer` table. All the data in the column will be lost.
  - The values [SPAM] on the enum `CustomerMessage_status` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `customeractivity` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `customeractivity` DROP FOREIGN KEY `CustomerActivity_customerId_fkey`;

-- AlterTable
ALTER TABLE `customer` DROP COLUMN `decisionStage`,
    DROP COLUMN `health`,
    DROP COLUMN `mrrCents`,
    DROP COLUMN `nextStep`,
    DROP COLUMN `nextStepDueAt`,
    DROP COLUMN `ownerName`,
    DROP COLUMN `region`,
    DROP COLUMN `segment`,
    ADD COLUMN `city` VARCHAR(120) NULL,
    ADD COLUMN `email` VARCHAR(191) NULL,
    ADD COLUMN `marketingOptIn` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mobile` VARCHAR(64) NULL,
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `phone` VARCHAR(64) NULL,
    ADD COLUMN `postalCode` VARCHAR(32) NULL,
    ADD COLUMN `street` VARCHAR(191) NULL,
    ADD COLUMN `totalSpendCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `type` ENUM('PRIVATE', 'BUSINESS', 'FLEET') NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE `customermessage` MODIFY `status` ENUM('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'SENT',
    MODIFY `readAt` DATETIME(3) NULL;

-- DropTable
DROP TABLE `customeractivity`;

-- CreateTable
CREATE TABLE `Vehicle` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `manufacturer` VARCHAR(120) NULL,
    `model` VARCHAR(120) NULL,
    `trim` VARCHAR(120) NULL,
    `licensePlate` VARCHAR(64) NULL,
    `vin` VARCHAR(191) NULL,
    `year` INTEGER NULL,
    `mileageKm` INTEGER NULL,
    `fuelType` ENUM('GASOLINE', 'DIESEL', 'ELECTRIC', 'HYBRID', 'LPG', 'OTHER') NULL,
    `transmission` ENUM('MANUAL', 'AUTOMATIC') NULL,
    `color` VARCHAR(64) NULL,
    `lastServiceAt` DATETIME(3) NULL,
    `nextServiceAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Vehicle_tenantId_idx`(`tenantId`),
    INDEX `Vehicle_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceOrder` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `concern` VARCHAR(255) NULL,
    `status` ENUM('PLANNED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
    `advisorName` VARCHAR(120) NULL,
    `technicianName` VARCHAR(120) NULL,
    `scheduledAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `odometerKm` INTEGER NULL,
    `estimateCents` INTEGER NULL,
    `totalCents` INTEGER NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ServiceOrder_tenantId_idx`(`tenantId`),
    INDEX `ServiceOrder_customerId_idx`(`customerId`),
    INDEX `ServiceOrder_vehicleId_idx`(`vehicleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceOrder` ADD CONSTRAINT `ServiceOrder_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceOrder` ADD CONSTRAINT `ServiceOrder_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceOrder` ADD CONSTRAINT `ServiceOrder_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
