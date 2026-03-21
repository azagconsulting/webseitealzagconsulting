ALTER TABLE `AppointmentSlot`
  ADD COLUMN `bookedById` VARCHAR(191) NULL,
  ADD COLUMN `customerId` VARCHAR(191) NULL,
  ADD COLUMN `bookingNotes` TEXT NULL,
  ADD COLUMN `bookedAt` DATETIME(3) NULL;

ALTER TABLE `AppointmentSlot`
  ADD INDEX `AppointmentSlot_bookedById_idx`(`bookedById`),
  ADD INDEX `AppointmentSlot_tenantId_customerId_idx`(`tenantId`, `customerId`);

ALTER TABLE `AppointmentSlot`
  ADD CONSTRAINT `AppointmentSlot_bookedById_fkey`
    FOREIGN KEY (`bookedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `AppointmentSlot_customerId_fkey`
    FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
