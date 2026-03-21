ALTER TABLE `AppointmentSlot`
  ADD COLUMN `attendeeName` VARCHAR(191) NULL,
  ADD COLUMN `attendeeEmail` VARCHAR(191) NULL,
  ADD COLUMN `attendeePhone` VARCHAR(64) NULL,
  ADD COLUMN `meetingLink` VARCHAR(512) NULL,
  ADD COLUMN `reminderSentAt` DATETIME(3) NULL;
