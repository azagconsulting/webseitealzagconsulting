/*
  Warnings:

  - The values [SPAM] on the enum `CustomerMessage_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `customermessage` ADD COLUMN `analyzedAt` DATETIME(3) NULL,
    ADD COLUMN `category` ENUM('ANGEBOT', 'KRITISCH', 'KUENDIGUNG', 'WERBUNG', 'SONSTIGES') NULL,
    ADD COLUMN `sentiment` VARCHAR(64) NULL,
    ADD COLUMN `summary` VARCHAR(512) NULL,
    ADD COLUMN `urgency` VARCHAR(64) NULL,
    MODIFY `status` ENUM('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'SENT';

-- CreateIndex
CREATE INDEX `CustomerMessage_analyzedAt_idx` ON `CustomerMessage`(`analyzedAt`);
