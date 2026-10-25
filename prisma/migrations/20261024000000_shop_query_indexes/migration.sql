-- Shop-scoped list queries stay bounded as an owner adds more shops and history.
CREATE INDEX `Category_shopId_createdAt_idx` ON `Category`(`shopId`, `createdAt`);
CREATE INDEX `Product_shopId_isDeleted_createdAt_idx` ON `Product`(`shopId`, `isDeleted`, `createdAt`);
CREATE INDEX `Bill_shopId_isDeleted_createdAt_idx` ON `Bill`(`shopId`, `isDeleted`, `createdAt`);
CREATE INDEX `StockTransaction_shopId_createdAt_idx` ON `StockTransaction`(`shopId`, `createdAt`);
CREATE INDEX `Customer_shopId_isDeleted_createdAt_idx` ON `Customer`(`shopId`, `isDeleted`, `createdAt`);
CREATE INDEX `CustomerPayment_shopId_createdAt_idx` ON `CustomerPayment`(`shopId`, `createdAt`);
