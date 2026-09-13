-- ============================================================================
-- Ads + reward-coins economy, and Firebase Cloud Messaging (FCM) push
-- notifications.
--
-- Purely additive: every new column on an existing table (Admin, Device) is
-- either nullable or carries a DEFAULT, so MySQL backfills existing rows by
-- itself when the column is added — no separate backfill/normalize step is
-- needed (unlike 20260812070000_saas_multitenant_upgrade, which had to
-- tighten NOT NULL columns after backfilling). The two new tables
-- (AdCoinTransaction, Notification) start empty on every environment.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: Ads + reward-coins fields on Admin.
--   - adCoins: every existing Admin row gets the same 10-coin starter balance
--     new signups get (authController.js sets this explicitly at Admin.create,
--     this DEFAULT only matters for rows that already exist).
--   - syncUnlockExpiresAt: nullable, no unlock window until an admin spends
--     coins via POST /ads/sync/unlock.
-- ----------------------------------------------------------------------------

ALTER TABLE `Admin`
    ADD COLUMN `adCoins` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `syncUnlockExpiresAt` DATETIME(3) NULL;

-- ----------------------------------------------------------------------------
-- STEP 2: FCM registration token on Device (reusing the existing per-install
-- Device row rather than a separate token table).
-- ----------------------------------------------------------------------------

ALTER TABLE `Device`
    ADD COLUMN `fcmToken` VARCHAR(191) NULL;

-- ----------------------------------------------------------------------------
-- STEP 3: New tables.
-- ----------------------------------------------------------------------------

CREATE TABLE `AdCoinTransaction` (
    `id`           INTEGER NOT NULL AUTO_INCREMENT,
    `shopId`       INTEGER NOT NULL,
    `adminId`      INTEGER NOT NULL,
    `type`         VARCHAR(191) NOT NULL,
    `amount`       INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `clientId`     VARCHAR(191) NULL,
    `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdCoinTransaction_shopId_clientId_key`(`shopId`, `clientId`),
    INDEX `AdCoinTransaction_shopId_type_createdAt_idx`(`shopId`, `type`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Notification` (
    `id`        INTEGER NOT NULL AUTO_INCREMENT,
    `shopId`    INTEGER NOT NULL,
    `adminId`   INTEGER NOT NULL,
    `title`     VARCHAR(191) NOT NULL,
    `message`   VARCHAR(191) NOT NULL,
    `type`      VARCHAR(191) NULL,
    `data`      JSON NULL,
    `isRead`    BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_shopId_adminId_isRead_idx`(`shopId`, `adminId`, `isRead`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- STEP 4: Foreign keys — CASCADE on delete, matching the `onDelete: Cascade`
-- declared on these two models (unlike most other tenant tables in this
-- schema, which default to RESTRICT): an AdCoinTransaction/Notification row
-- is pure history/audit tied to one shop+admin, so removing either should
-- clean these up rather than block the delete.
-- ----------------------------------------------------------------------------

ALTER TABLE `AdCoinTransaction` ADD CONSTRAINT `AdCoinTransaction_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AdCoinTransaction` ADD CONSTRAINT `AdCoinTransaction_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Notification` ADD CONSTRAINT `Notification_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
