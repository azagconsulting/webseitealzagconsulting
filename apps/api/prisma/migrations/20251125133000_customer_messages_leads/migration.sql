-- AlterTable
ALTER TABLE `CustomerMessage`
    MODIFY `customerId` VARCHAR(191) NULL,
    ADD COLUMN `leadId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `CustomerMessage_leadId_createdAt_idx` ON `CustomerMessage`(`leadId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `CustomerMessage`
    ADD CONSTRAINT `CustomerMessage_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
