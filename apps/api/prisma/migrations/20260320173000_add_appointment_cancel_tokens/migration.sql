ALTER TABLE `AppointmentSlot`
  ADD COLUMN `cancelTokenHash` VARCHAR(128) NULL,
  ADD COLUMN `cancelTokenExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `canceledAt` DATETIME(3) NULL,
  ADD COLUMN `canceledBy` VARCHAR(64) NULL,
  ADD COLUMN `cancelReason` VARCHAR(255) NULL;

CREATE UNIQUE INDEX `AppointmentSlot_cancelTokenHash_key`
  ON `AppointmentSlot`(`cancelTokenHash`);

CREATE INDEX `AppointmentSlot_cancelTokenExpiresAt_idx`
  ON `AppointmentSlot`(`cancelTokenExpiresAt`);

CREATE INDEX `AppointmentSlot_canceledAt_idx`
  ON `AppointmentSlot`(`canceledAt`);
