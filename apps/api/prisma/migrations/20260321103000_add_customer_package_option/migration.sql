-- Add package option per customer for portal/dashboard configuration
ALTER TABLE `Customer`
  ADD COLUMN `customerPackage` ENUM('STARTER', 'GROWTH', 'ENTERPRISE') NOT NULL DEFAULT 'STARTER';
