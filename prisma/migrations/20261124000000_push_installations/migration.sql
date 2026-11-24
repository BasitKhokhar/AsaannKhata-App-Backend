CREATE TABLE `PushInstallation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `adminId` INTEGER NOT NULL,
    `installationId` VARCHAR(191) NOT NULL,
    `fcmToken` VARCHAR(4096) NULL,
    `deviceName` VARCHAR(191) NULL,
    `platform` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tokenUpdatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PushInstallation_adminId_isActive_idx`(`adminId`, `isActive`),
    INDEX `PushInstallation_fcmToken_idx`(`fcmToken`(191)),
    UNIQUE INDEX `PushInstallation_adminId_installationId_key`(`adminId`, `installationId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `PushInstallation_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
