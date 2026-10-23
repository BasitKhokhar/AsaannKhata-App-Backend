const prisma = require('../prisma/client');
const { convertToCm, calculateAreaCm2, getAreaConversionFactor, getLengthConversionFactor } = require('../utils/unitConverter');
const bucketStorage = require('../utils/bucketStorage');
const { normalizeStockType } = require('../utils/stockType');

// Create a new Product
// Note: multer (`upload.single('image')`) is applied in the route file, BEFORE
// tenantContext — tenantContext reads req.body.shopId, which multer must have
// already parsed off the multipart body for that to be populated.
exports.createProduct = async (req, res) => {
        const {
            categoryId,
            name,
            stockType,
            quantity,
            purchasePrice,
            salePrice,
            unit, // for area/length: feet | meter | inch | cm
            sheetWidth,
            sheetHeight,
            packSize,
            packPurchasePrice,
            packSalePrice,
            stockPacks,
            stockLooseUnits,
            lowStockThreshold,
        } = req.body;

        const shopId = req.tenant.shopId;
        const file = req.file;

        try {
            let imageUrl = req.body.image;

            if (file && file.buffer) {
                const filename = `${Date.now()}_${file.originalname}`;
                imageUrl = await bucketStorage.uploadImageFromBuffer(file.buffer, file.mimetype, filename);
            }

            let data = {
                shopId,
                categoryId: categoryId && categoryId !== 'undefined' && !isNaN(parseInt(categoryId)) ? parseInt(categoryId) : null,
                name,
                image: imageUrl,
                purchasePrice: parseFloat(purchasePrice),
                salePrice: parseFloat(salePrice),
                lowStockThreshold: lowStockThreshold === undefined || lowStockThreshold === '' ? null : parseFloat(lowStockThreshold),
            };

            const normalizedType = normalizeStockType(stockType);
            data.stockType = normalizedType;

            if (normalizedType === 'AREA') {
                const widthCm = convertToCm(parseFloat(sheetWidth), unit);
                const heightCm = convertToCm(parseFloat(sheetHeight), unit);
                const areaCm2 = calculateAreaCm2(parseFloat(sheetWidth), parseFloat(sheetHeight), unit);
                const areaFactor = getAreaConversionFactor(unit);

                data.sheetWidthCm = widthCm;
                data.sheetHeightCm = heightCm;
                data.sheetAreaCm2 = areaCm2;
                data.stockAreaCm2 = areaCm2 * (parseFloat(quantity) || 0);
                data.stockQuantity = parseFloat(quantity) || 0;

                if (areaFactor > 1) {
                    data.purchasePrice = parseFloat(purchasePrice) / areaFactor;
                    data.salePrice = parseFloat(salePrice) / areaFactor;
                }
            } else if (normalizedType === 'LENGTH') {
                const lengthFactor = getLengthConversionFactor(unit);
                data.stockLengthCm = convertToCm(parseFloat(quantity) || 0, unit);

                if (lengthFactor > 1) {
                    data.purchasePrice = parseFloat(purchasePrice) / lengthFactor;
                    data.salePrice = parseFloat(salePrice) / lengthFactor;
                }
            } else if (normalizedType === 'PACK') {
                data.packSize = parseInt(packSize) || null;
                data.stockPacks = parseFloat(stockPacks) || 0;
                data.stockLooseUnits = parseFloat(stockLooseUnits) || 0;
                data.packPurchasePrice = packPurchasePrice ? parseFloat(packPurchasePrice) : null;
                data.packSalePrice = packSalePrice ? parseFloat(packSalePrice) : null;
            } else {
                data.stockQuantity = parseFloat(quantity) || 0;
            }

            const result = await prisma.$transaction(async (tx) => {
                const product = await tx.product.create({ data });

                const initialQty = normalizedType === 'PACK'
                    ? (parseFloat(stockPacks) || 0) * (parseInt(packSize) || 1) + (parseFloat(stockLooseUnits) || 0)
                    : parseFloat(quantity) || 0;

                if (initialQty > 0) {
                    await tx.stockTransaction.create({
                        data: {
                            shopId,
                            productId: product.id,
                            type: 'IN',
                            quantity: initialQty,
                            price: parseFloat(purchasePrice),
                            description: 'Initial stock on product creation',
                        },
                    });
                }

                return product;
            });

            res.status(201).json({ message: 'Product created successfully', product: result });
        } catch (err) {
            console.error('❌ Create Product Error:', err);
            res.status(500).json({ error: err.message });
        }
};

// Get all products (filtered by shop and optionally category)
exports.getProducts = async (req, res) => {
    try {
        const { categoryId } = req.query;
        const shopId = req.tenant.shopId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const where = { shopId, isDeleted: false };
        if (categoryId) where.categoryId = parseInt(categoryId);

        const products = await prisma.product.findMany({
            where,
            include: { category: true },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        });

        const total = await prisma.product.count({ where });
        const hasMore = skip + limit < total;

        res.json({ success: true, products, total, page, limit, hasMore });
    } catch (err) {
        console.error('Get Products Error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

// Get all products (filtered by shop) — legacy paginated-by-route-param variant
exports.getAllProducts = async (req, res) => {
    try {
        const shopId = req.tenant.shopId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const where = { shopId, isDeleted: false };

        const products = await prisma.product.findMany({
            where,
            include: { category: true },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        });

        const total = await prisma.product.count({ where });
        const hasMore = skip + limit < total;

        res.json({ success: true, products, total, page, limit, hasMore });
    } catch (err) {
        console.error('❌ Error fetching products:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

// Get single product by ID (ownership resolved by middleware.tenantContext.byResourceId)
exports.getProductById = async (req, res) => {
    try {
        const product = await prisma.product.findFirst({
            where: { id: parseInt(req.params.id), shopId: req.tenant.shopId },
            include: { category: true, shop: true },
        });

        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (err) {
        console.error('Get Product Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Update a product
exports.updateProduct = async (req, res) => {
        try {
            const productId = parseInt(req.params.id);
            const shopId = req.tenant.shopId;
            const {
                categoryId,
                name,
                stockType,
                quantity,
                purchasePrice,
                salePrice,
                unit,
                sheetWidth,
                sheetHeight,
                packSize,
                packPurchasePrice,
                packSalePrice,
                stockPacks,
                stockLooseUnits,
                lowStockThreshold,
            } = req.body;

            const file = req.file;

            const existingProduct = await prisma.product.findFirst({ where: { id: productId, shopId } });
            if (!existingProduct) return res.status(404).json({ message: 'Product not found' });

            let imageUrl = req.body.image || existingProduct.image;

            if (file && file.buffer) {
                const filename = `${Date.now()}_${file.originalname}`;
                imageUrl = await bucketStorage.uploadImageFromBuffer(file.buffer, file.mimetype, filename);
            }

            const updateData = {
                name,
                image: imageUrl,
                purchasePrice: purchasePrice ? parseFloat(purchasePrice) : undefined,
                salePrice: salePrice ? parseFloat(salePrice) : undefined,
                lowStockThreshold: lowStockThreshold === undefined ? undefined : lowStockThreshold === '' ? null : parseFloat(lowStockThreshold),
            };

            if (categoryId !== undefined && categoryId !== 'undefined') {
                const parsedId = parseInt(categoryId);
                updateData.categoryId = !isNaN(parsedId) ? parsedId : null;
            }

            const currentType = stockType ? normalizeStockType(stockType) : existingProduct.stockType;
            updateData.stockType = currentType;

            let stockLogQty = 0;
            let stockLogDirection = 0;

            if (currentType === 'AREA') {
                const sWidth = sheetWidth !== undefined ? parseFloat(sheetWidth) : existingProduct.sheetWidthCm;
                const sHeight = sheetHeight !== undefined ? parseFloat(sheetHeight) : existingProduct.sheetHeightCm;

                if (sheetWidth !== undefined || sheetHeight !== undefined || unit !== undefined) {
                    const useUnit = unit || 'cm';
                    const widthCm = convertToCm(sWidth, useUnit);
                    const heightCm = convertToCm(sHeight, useUnit);
                    const areaCm2 = calculateAreaCm2(sWidth, sHeight, useUnit);
                    const areaFactor = getAreaConversionFactor(useUnit);

                    updateData.sheetWidthCm = widthCm;
                    updateData.sheetHeightCm = heightCm;
                    updateData.sheetAreaCm2 = areaCm2;

                    if (purchasePrice !== undefined && areaFactor > 1) updateData.purchasePrice = parseFloat(purchasePrice) / areaFactor;
                    if (salePrice !== undefined && areaFactor > 1) updateData.salePrice = parseFloat(salePrice) / areaFactor;

                    if (quantity !== undefined) {
                        updateData.stockQuantity = parseFloat(quantity);
                        updateData.stockAreaCm2 = areaCm2 * parseFloat(quantity);
                    } else {
                        updateData.stockAreaCm2 = areaCm2 * existingProduct.stockQuantity;
                    }
                } else if (quantity !== undefined) {
                    updateData.stockQuantity = parseFloat(quantity);
                    updateData.stockAreaCm2 = (existingProduct.sheetAreaCm2 || 0) * parseFloat(quantity);
                }

                if (quantity !== undefined) {
                    const diff = parseFloat(quantity) - existingProduct.stockQuantity;
                    stockLogQty = Math.abs(diff);
                    stockLogDirection = diff;
                }
            } else if (currentType === 'LENGTH') {
                const lengthFactor = getLengthConversionFactor(unit || 'cm');
                if (purchasePrice !== undefined && lengthFactor > 1) updateData.purchasePrice = parseFloat(purchasePrice) / lengthFactor;
                if (salePrice !== undefined && lengthFactor > 1) updateData.salePrice = parseFloat(salePrice) / lengthFactor;

                if (quantity !== undefined) {
                    const newLengthCm = convertToCm(parseFloat(quantity), unit || 'cm');
                    updateData.stockLengthCm = newLengthCm;
                    const diff = newLengthCm - existingProduct.stockLengthCm;
                    stockLogQty = Math.abs(diff);
                    stockLogDirection = diff;
                }
            } else if (currentType === 'PACK') {
                if (packSize !== undefined) updateData.packSize = parseInt(packSize) || null;
                if (packPurchasePrice !== undefined) updateData.packPurchasePrice = packPurchasePrice ? parseFloat(packPurchasePrice) : null;
                if (packSalePrice !== undefined) updateData.packSalePrice = packSalePrice ? parseFloat(packSalePrice) : null;
                if (stockPacks !== undefined) updateData.stockPacks = parseFloat(stockPacks);
                if (stockLooseUnits !== undefined) updateData.stockLooseUnits = parseFloat(stockLooseUnits);
            } else {
                if (quantity !== undefined) {
                    updateData.stockQuantity = parseFloat(quantity);
                    const diff = parseFloat(quantity) - existingProduct.stockQuantity;
                    stockLogQty = Math.abs(diff);
                    stockLogDirection = diff;
                }
            }

            const result = await prisma.$transaction(async (tx) => {
                const product = await tx.product.update({ where: { id: productId, shopId }, data: updateData });

                if (stockLogQty !== 0) {
                    await tx.stockTransaction.create({
                        data: {
                            shopId,
                            productId: product.id,
                            type: stockLogDirection > 0 ? 'IN' : 'OUT',
                            quantity: stockLogQty,
                            price: purchasePrice ? parseFloat(purchasePrice) : existingProduct.purchasePrice,
                            description: 'Stock updated via product edit',
                        },
                    });
                }

                return product;
            });

            res.json({ message: 'Product updated successfully', product: result });
        } catch (err) {
            console.error('Update Product Error:', err);
            res.status(500).json({ error: err.message });
        }
};

// Soft-delete a product — hard delete would throw once the product has ever
// been sold/stock-logged (FK RESTRICT), and a tombstone is required for sync.
exports.deleteProduct = async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const shopId = req.tenant.shopId;

        const existing = await prisma.product.findFirst({ where: { id: productId, shopId } });
        if (!existing) return res.status(404).json({ message: 'Product not found' });

        await prisma.product.update({
            where: { id: productId, shopId },
            data: { isDeleted: true, deletedAt: new Date() },
        });

        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        console.error('Delete Product Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Search products by name within a shop
exports.searchProducts = async (req, res) => {
    try {
        const { q, page, limit } = req.query;
        const shopId = req.tenant.shopId;

        if (!q || q.trim() === '') {
            return res.status(400).json({ message: 'Search query is required' });
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {
            shopId,
            isDeleted: false,
            name: { contains: q },
        };

        const products = await prisma.product.findMany({
            where,
            include: { category: true },
            orderBy: { createdAt: 'desc' },
            skip,
            take: parseInt(limit),
        });

        const total = await prisma.product.count({ where });

        return res.status(200).json({
            success: true,
            products,
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            hasMore: skip + products.length < total,
        });
    } catch (err) {
        console.error('❌ Error in searchProducts:', err);
        return res.status(500).json({ success: false, message: 'Server error while searching products', error: err.message });
    }
};
