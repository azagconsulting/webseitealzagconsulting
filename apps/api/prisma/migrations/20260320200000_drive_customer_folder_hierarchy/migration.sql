ALTER TABLE `DriveFolder`
  ADD COLUMN `kind` ENUM('GENERAL', 'CUSTOMERS_ROOT', 'CUSTOMER') NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN `parentId` VARCHAR(191) NULL,
  ADD COLUMN `customerId` VARCHAR(191) NULL,
  ADD COLUMN `systemKey` VARCHAR(64) NULL;

-- Reuse an existing top-level "Kunden" team folder as system root if possible.
UPDATE `DriveFolder` `candidate`
LEFT JOIN `DriveFolder` `existingRoot`
  ON `existingRoot`.`tenantId` = `candidate`.`tenantId`
 AND `existingRoot`.`kind` = 'CUSTOMERS_ROOT'
 AND `existingRoot`.`systemKey` = 'team_customers_root'
SET
  `candidate`.`kind` = 'CUSTOMERS_ROOT',
  `candidate`.`systemKey` = 'team_customers_root'
WHERE
  `candidate`.`scope` = 'TEAM'
  AND `candidate`.`parentId` IS NULL
  AND LOWER(TRIM(`candidate`.`name`)) = 'kunden'
  AND `existingRoot`.`id` IS NULL;

-- Ensure each tenant has one dedicated system root folder "Kunden".
INSERT INTO `DriveFolder` (
  `id`,
  `tenantId`,
  `ownerUserId`,
  `scope`,
  `kind`,
  `parentId`,
  `customerId`,
  `systemKey`,
  `name`,
  `createdAt`,
  `updatedAt`
)
SELECT
  UUID(),
  `t`.`id`,
  NULL,
  'TEAM',
  'CUSTOMERS_ROOT',
  NULL,
  NULL,
  'team_customers_root',
  'Kunden',
  NOW(3),
  NOW(3)
FROM `Tenant` `t`
LEFT JOIN `DriveFolder` `root`
  ON `root`.`tenantId` = `t`.`id`
 AND `root`.`kind` = 'CUSTOMERS_ROOT'
 AND `root`.`systemKey` = 'team_customers_root'
WHERE `root`.`id` IS NULL;

-- Backfill old customer folders created with the legacy name scheme: kunde__<customerId>__...
UPDATE `DriveFolder` `f`
JOIN `Customer` `c`
  ON `c`.`id` = SUBSTRING_INDEX(SUBSTRING(`f`.`name`, 8), '__', 1)
 AND `c`.`tenantId` = `f`.`tenantId`
SET
  `f`.`kind` = 'CUSTOMER',
  `f`.`customerId` = `c`.`id`,
  `f`.`name` = LEFT(TRIM(`c`.`name`), 255)
WHERE
  `f`.`scope` = 'TEAM'
  AND `f`.`name` LIKE 'kunde__%__%'
  AND `f`.`customerId` IS NULL;

-- Attach all customer folders under the tenant's system root folder.
UPDATE `DriveFolder` `customerFolder`
JOIN `DriveFolder` `root`
  ON `root`.`tenantId` = `customerFolder`.`tenantId`
 AND `root`.`kind` = 'CUSTOMERS_ROOT'
 AND `root`.`systemKey` = 'team_customers_root'
SET `customerFolder`.`parentId` = `root`.`id`
WHERE
  `customerFolder`.`kind` = 'CUSTOMER'
  AND `customerFolder`.`parentId` IS NULL;

-- If duplicate folders point to the same customer, keep the lexicographically smallest id as canonical.
UPDATE `DriveFolder` `dup`
JOIN `DriveFolder` `keep`
  ON `keep`.`tenantId` = `dup`.`tenantId`
 AND `keep`.`customerId` = `dup`.`customerId`
 AND `keep`.`id` < `dup`.`id`
SET
  `dup`.`kind` = 'GENERAL',
  `dup`.`customerId` = NULL,
  `dup`.`parentId` = NULL
WHERE `dup`.`customerId` IS NOT NULL;

CREATE INDEX `DriveFolder_parentId_idx` ON `DriveFolder`(`parentId`);
CREATE INDEX `DriveFolder_customerId_idx` ON `DriveFolder`(`customerId`);
CREATE INDEX `DriveFolder_tenantId_kind_idx` ON `DriveFolder`(`tenantId`, `kind`);

CREATE UNIQUE INDEX `DriveFolder_tenantId_kind_systemKey_key`
  ON `DriveFolder`(`tenantId`, `kind`, `systemKey`);

CREATE UNIQUE INDEX `DriveFolder_tenantId_customerId_key`
  ON `DriveFolder`(`tenantId`, `customerId`);

ALTER TABLE `DriveFolder`
  ADD CONSTRAINT `DriveFolder_parentId_fkey`
    FOREIGN KEY (`parentId`) REFERENCES `DriveFolder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `DriveFolder_customerId_fkey`
    FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
