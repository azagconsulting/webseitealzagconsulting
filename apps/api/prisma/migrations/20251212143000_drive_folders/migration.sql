-- Create DriveFolder table
CREATE TABLE `DriveFolder` (
  `id` varchar(191) NOT NULL,
  `tenantId` varchar(191) NOT NULL,
  `ownerUserId` varchar(191) NULL,
  `scope` ENUM('USER','TEAM') NOT NULL,
  `name` varchar(255) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DriveFolder`
  ADD INDEX `DriveFolder_tenantId_scope_idx`(`tenantId`, `scope`),
  ADD INDEX `DriveFolder_ownerUserId_idx`(`ownerUserId`);

ALTER TABLE `DriveFolder`
  ADD CONSTRAINT `DriveFolder_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `DriveFolder_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Add folderId to DriveFile
ALTER TABLE `DriveFile` ADD COLUMN `folderId` varchar(191) NULL;
ALTER TABLE `DriveFile` ADD INDEX `DriveFile_folderId_idx`(`folderId`);
ALTER TABLE `DriveFile` ADD CONSTRAINT `DriveFile_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `DriveFolder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
