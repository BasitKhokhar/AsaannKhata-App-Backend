CREATE TABLE `AppPopup` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(20) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `activeSlot` INTEGER NULL,
    `title` VARCHAR(160) NOT NULL DEFAULT '',
    `message` TEXT NOT NULL,
    `imageUrl` TEXT NULL,
    `videoUrl` TEXT NULL,
    `actionUrl` TEXT NULL,
    `buttonLabel` VARCHAR(60) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `AppPopup_activeSlot_key` (`activeSlot`),
    INDEX `AppPopup_active_updatedAt_idx` (`active`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
