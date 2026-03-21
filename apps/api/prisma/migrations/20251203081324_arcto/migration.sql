/*
  Warnings:

  - The values [SPAM] on the enum `CustomerMessage_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `customermessage` MODIFY `status` ENUM('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'SENT',
    MODIFY `category` ENUM('ANGEBOT', 'KOSTENVORANSCHLAG', 'KRITISCH', 'KUENDIGUNG', 'WERBUNG', 'SONSTIGES') NULL,
    MODIFY `readAt` DATETIME(3) NULL;
