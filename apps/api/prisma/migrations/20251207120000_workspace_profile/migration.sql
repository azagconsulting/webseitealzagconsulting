-- CreateTable
CREATE TABLE `DriveFile` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `scope` ENUM('USER', 'TEAM') NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `storageKey` VARCHAR(512) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkspaceProfile` (
    `tenantId` VARCHAR(191) NOT NULL,
    `companyName` VARCHAR(191) NULL,
    `legalName` VARCHAR(191) NULL,
    `industry` VARCHAR(191) NULL,
    `tagline` VARCHAR(191) NULL,
    `mission` LONGTEXT NULL,
    `vision` LONGTEXT NULL,
    `description` LONGTEXT NULL,
    `foundedYear` INTEGER NULL,
    `teamSize` INTEGER NULL,
    `supportEmail` VARCHAR(191) NULL,
    `supportPhone` VARCHAR(64) NULL,
    `timezone` VARCHAR(120) NULL,
    `currency` VARCHAR(10) NULL,
    `vatNumber` VARCHAR(64) NULL,
    `registerNumber` VARCHAR(64) NULL,
    `street` VARCHAR(191) NULL,
    `postalCode` VARCHAR(64) NULL,
    `city` VARCHAR(120) NULL,
    `country` VARCHAR(120) NULL,
    `website` VARCHAR(255) NULL,
    `primaryColor` VARCHAR(32) NULL,
    `secondaryColor` VARCHAR(32) NULL,
    `accentColor` VARCHAR(32) NULL,
    `logoFileId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `DriveFile_tenantId_scope_isDeleted_idx` ON `DriveFile`(`tenantId`, `scope`, `isDeleted`);

-- CreateIndex
CREATE INDEX `DriveFile_ownerUserId_idx` ON `DriveFile`(`ownerUserId`);

-- CreateIndex
CREATE INDEX `DriveFile_uploadedById_idx` ON `DriveFile`(`uploadedById`);

-- CreateIndex
CREATE INDEX `WorkspaceProfile_logoFileId_idx` ON `WorkspaceProfile`(`logoFileId`);

-- AddForeignKey
ALTER TABLE `DriveFile`
  ADD CONSTRAINT `DriveFile_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DriveFile`
  ADD CONSTRAINT `DriveFile_ownerUserId_fkey`
  FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DriveFile`
  ADD CONSTRAINT `DriveFile_uploadedById_fkey`
  FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceProfile`
  ADD CONSTRAINT `WorkspaceProfile_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `WorkspaceProfile`
  ADD CONSTRAINT `WorkspaceProfile_logoFileId_fkey`
  FOREIGN KEY (`logoFileId`) REFERENCES `DriveFile`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
