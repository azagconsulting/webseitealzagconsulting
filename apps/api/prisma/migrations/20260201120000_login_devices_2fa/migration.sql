-- Create TrustedDevice and DeviceVerificationToken tables for login 2FA
CREATE TABLE `TrustedDevice` (
  `id` varchar(191) NOT NULL,
  `tenantId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `deviceHash` varchar(191) NOT NULL,
  `lastSeenAt` datetime(3) NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `revokedAt` datetime(3) NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TrustedDevice`
  ADD UNIQUE INDEX `TrustedDevice_userId_deviceHash_key`(`userId`, `deviceHash`),
  ADD INDEX `TrustedDevice_tenantId_idx`(`tenantId`),
  ADD INDEX `TrustedDevice_userId_idx`(`userId`),
  ADD INDEX `TrustedDevice_expiresAt_idx`(`expiresAt`);

ALTER TABLE `TrustedDevice`
  ADD CONSTRAINT `TrustedDevice_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `TrustedDevice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `DeviceVerificationToken` (
  `id` varchar(191) NOT NULL,
  `tenantId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `deviceHash` varchar(191) NOT NULL,
  `codeHash` varchar(191) NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `usedAt` datetime(3) NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DeviceVerificationToken`
  ADD INDEX `DeviceVerificationToken_tenantId_idx`(`tenantId`),
  ADD INDEX `DeviceVerificationToken_userId_idx`(`userId`),
  ADD INDEX `DeviceVerificationToken_expiresAt_idx`(`expiresAt`),
  ADD INDEX `DeviceVerificationToken_userId_deviceHash_idx`(`userId`, `deviceHash`);

ALTER TABLE `DeviceVerificationToken`
  ADD CONSTRAINT `DeviceVerificationToken_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `DeviceVerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
