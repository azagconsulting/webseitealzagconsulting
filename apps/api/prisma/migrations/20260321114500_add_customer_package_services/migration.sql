-- Add customizable package services per customer
ALTER TABLE `Customer`
  ADD COLUMN `packageServices` JSON NULL;
