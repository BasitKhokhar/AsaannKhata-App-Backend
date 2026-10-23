ALTER TABLE `Bill` ADD COLUMN `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'UNSPECIFIED';

INSERT IGNORE INTO `ShopType` (`code`, `label`, `defaultStockType`, `isActive`, `sortOrder`, `updatedAt`) VALUES
('GROCERY_STORE', 'Grocery Store', 'QUANTITY', true, 14, CURRENT_TIMESTAMP(3)),
('MILK_SHOP', 'Milk Shop', 'QUANTITY', true, 15, CURRENT_TIMESTAMP(3)),
('ATTA_CHAKKI', 'Atta Chakki', 'QUANTITY', true, 16, CURRENT_TIMESTAMP(3)),
('CLOTHING_STORE', 'Clothing Store', 'QUANTITY', true, 17, CURRENT_TIMESTAMP(3)),
('BAKERY', 'Bakery', 'QUANTITY', true, 18, CURRENT_TIMESTAMP(3)),
('RESTAURANT', 'Restaurant', 'QUANTITY', true, 19, CURRENT_TIMESTAMP(3)),
('SALON_SPA', 'Salon & Spa', 'QUANTITY', true, 20, CURRENT_TIMESTAMP(3)),
('AUTO_PARTS', 'Auto Parts', 'QUANTITY', true, 21, CURRENT_TIMESTAMP(3)),
('MOBILE_SHOP', 'Mobile Shop', 'QUANTITY', true, 22, CURRENT_TIMESTAMP(3));
