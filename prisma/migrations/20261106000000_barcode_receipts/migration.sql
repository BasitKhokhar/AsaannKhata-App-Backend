ALTER TABLE `Product` ADD COLUMN `barcode` VARCHAR(128) NULL, ADD COLUMN `looseBarcode` VARCHAR(128) NULL;
ALTER TABLE `Bill` ADD COLUMN `receiptSnapshot` JSON NULL;
CREATE TABLE `ProductBarcode` (
  `shopId` INTEGER NOT NULL, `code` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  `productId` INTEGER NOT NULL, `unit` VARCHAR(16) NOT NULL,
  PRIMARY KEY (`shopId`, `code`), INDEX `ProductBarcode_productId_idx` (`productId`),
  CONSTRAINT `ProductBarcode_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ProductBarcode_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `ReceiptProfile` (
  `shopId` INTEGER NOT NULL, `config` JSON NOT NULL, `version` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL, PRIMARY KEY (`shopId`),
  CONSTRAINT `ReceiptProfile_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
