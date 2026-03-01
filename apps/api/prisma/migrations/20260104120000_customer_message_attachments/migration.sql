-- Add attachments JSON column for storing message attachments (base64 encoded)
ALTER TABLE `CustomerMessage`
ADD COLUMN `attachments` JSON NULL;
