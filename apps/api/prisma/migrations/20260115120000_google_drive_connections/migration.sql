-- Create GoogleDriveConnection table
CREATE TABLE `GoogleDriveConnection` (
  `id` varchar(191) NOT NULL,
  `tenantId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `email` varchar(191) NULL,
  `displayName` varchar(191) NULL,
  `avatarUrl` varchar(512) NULL,
  `accessToken` text NOT NULL,
  `refreshToken` text NULL,
  `scope` text NULL,
  `tokenType` varchar(32) NULL,
  `expiresAt` datetime(3) NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GoogleDriveConnection`
  ADD UNIQUE INDEX `GoogleDriveConnection_tenantId_userId_key`(`tenantId`, `userId`),
  ADD INDEX `GoogleDriveConnection_tenantId_idx`(`tenantId`),
  ADD INDEX `GoogleDriveConnection_userId_idx`(`userId`);

ALTER TABLE `GoogleDriveConnection`
  ADD CONSTRAINT `GoogleDriveConnection_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `GoogleDriveConnection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
