-- Create AppointmentSlot table
CREATE TABLE `AppointmentSlot` (
  `id` varchar(191) NOT NULL,
  `tenantId` varchar(191) NOT NULL,
  `createdById` varchar(191) NULL,
  `date` varchar(10) NOT NULL,
  `startTime` varchar(5) NOT NULL,
  `endTime` varchar(5) NOT NULL,
  `title` varchar(191) NOT NULL,
  `status` ENUM('FREE', 'BLOCKED') NOT NULL DEFAULT 'FREE',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AppointmentSlot`
  ADD INDEX `AppointmentSlot_tenantId_date_idx`(`tenantId`, `date`),
  ADD INDEX `AppointmentSlot_tenantId_status_idx`(`tenantId`, `status`),
  ADD INDEX `AppointmentSlot_createdById_idx`(`createdById`);

ALTER TABLE `AppointmentSlot`
  ADD CONSTRAINT `AppointmentSlot_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `AppointmentSlot_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Create AppointmentTemplate table
CREATE TABLE `AppointmentTemplate` (
  `id` varchar(191) NOT NULL,
  `tenantId` varchar(191) NOT NULL,
  `createdById` varchar(191) NULL,
  `title` varchar(191) NOT NULL,
  `startTime` varchar(5) NOT NULL,
  `endTime` varchar(5) NOT NULL,
  `status` ENUM('FREE', 'BLOCKED') NOT NULL DEFAULT 'FREE',
  `recurrence` ENUM('DAILY', 'WEEKLY') NOT NULL DEFAULT 'WEEKLY',
  `weekdays` varchar(32) NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AppointmentTemplate`
  ADD INDEX `AppointmentTemplate_tenantId_recurrence_idx`(`tenantId`, `recurrence`),
  ADD INDEX `AppointmentTemplate_tenantId_status_idx`(`tenantId`, `status`),
  ADD INDEX `AppointmentTemplate_createdById_idx`(`createdById`);

ALTER TABLE `AppointmentTemplate`
  ADD CONSTRAINT `AppointmentTemplate_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `AppointmentTemplate_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
