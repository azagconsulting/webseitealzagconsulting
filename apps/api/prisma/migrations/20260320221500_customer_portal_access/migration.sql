-- Alter user role enum and add optional customer mapping for portal logins
ALTER TABLE `User`
  MODIFY `role` ENUM('ADMIN', 'COORDINATOR', 'AGENT', 'VIEWER', 'CUSTOMER') NOT NULL DEFAULT 'COORDINATOR',
  ADD COLUMN `customerId` VARCHAR(191) NULL;

-- Helpful index for customer user lookups
CREATE INDEX `User_customerId_idx` ON `User`(`customerId`);

-- Keep portal user link consistent with customer lifecycle
ALTER TABLE `User`
  ADD CONSTRAINT `User_customerId_fkey`
  FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
