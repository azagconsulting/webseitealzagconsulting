-- Add internal chat conversations, messages and attachments
CREATE TABLE `ChatConversation` (
  `id` varchar(191) NOT NULL,
  `tenantId` varchar(191) NOT NULL,
  `type` ENUM('TEAM','DIRECT','CUSTOMER') NOT NULL,
  `systemKey` varchar(120) NOT NULL,
  `title` varchar(191) NULL,
  `customerId` varchar(191) NULL,
  `createdById` varchar(191) NULL,
  `lastMessageAt` datetime(3) NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ChatConversation_tenantId_type_systemKey_key`(`tenantId`, `type`, `systemKey`),
  INDEX `ChatConversation_tenantId_type_lastMessageAt_idx`(`tenantId`, `type`, `lastMessageAt`),
  INDEX `ChatConversation_customerId_idx`(`customerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatConversationMember` (
  `id` varchar(191) NOT NULL,
  `conversationId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ChatConversationMember_conversationId_userId_key`(`conversationId`, `userId`),
  INDEX `ChatConversationMember_userId_conversationId_idx`(`userId`, `conversationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatMessage` (
  `id` varchar(191) NOT NULL,
  `tenantId` varchar(191) NOT NULL,
  `conversationId` varchar(191) NOT NULL,
  `senderId` varchar(191) NOT NULL,
  `body` text NULL,
  `deletedAt` datetime(3) NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `ChatMessage_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
  INDEX `ChatMessage_tenantId_createdAt_idx`(`tenantId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatMessageAttachment` (
  `id` varchar(191) NOT NULL,
  `messageId` varchar(191) NOT NULL,
  `driveFileId` varchar(191) NOT NULL,
  `name` varchar(255) NOT NULL,
  `mimeType` varchar(191) NULL,
  `size` int NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ChatMessageAttachment_messageId_idx`(`messageId`),
  INDEX `ChatMessageAttachment_driveFileId_idx`(`driveFileId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatReadState` (
  `id` varchar(191) NOT NULL,
  `tenantId` varchar(191) NOT NULL,
  `conversationId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `lastReadMessageId` varchar(191) NULL,
  `lastReadAt` datetime(3) NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ChatReadState_conversationId_userId_key`(`conversationId`, `userId`),
  INDEX `ChatReadState_tenantId_userId_updatedAt_idx`(`tenantId`, `userId`, `updatedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ChatConversation`
  ADD CONSTRAINT `ChatConversation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatConversation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatConversation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ChatConversationMember`
  ADD CONSTRAINT `ChatConversationMember_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatConversationMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ChatMessage`
  ADD CONSTRAINT `ChatMessage_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatMessage_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ChatMessageAttachment`
  ADD CONSTRAINT `ChatMessageAttachment_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `ChatMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatMessageAttachment_driveFileId_fkey` FOREIGN KEY (`driveFileId`) REFERENCES `DriveFile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ChatReadState`
  ADD CONSTRAINT `ChatReadState_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatReadState_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatReadState_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatReadState_lastReadMessageId_fkey` FOREIGN KEY (`lastReadMessageId`) REFERENCES `ChatMessage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
