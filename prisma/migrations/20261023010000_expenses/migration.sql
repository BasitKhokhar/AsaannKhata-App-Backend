CREATE TABLE `Expense` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` INTEGER NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `note` VARCHAR(191) NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `clientId` VARCHAR(191) NULL,
    `deviceId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `Expense_shopId_clientId_key`(`shopId`, `clientId`),
    INDEX `Expense_shopId_updatedAt_idx`(`shopId`, `updatedAt`),
    INDEX `Expense_shopId_occurredAt_idx`(`shopId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Expense` ADD CONSTRAINT `Expense_shopId_fkey`
    FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
