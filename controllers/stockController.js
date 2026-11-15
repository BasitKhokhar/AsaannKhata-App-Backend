const prisma = require('../prisma/client');

const VALID_TYPES = ['IN', 'OUT', 'PACK_BREAK'];

// Manually add/remove stock, or break a sealed pack into loose units.
exports.addStockLog = async (req, res) => {
    const { productId, type, quantity, price, description } = req.body;
    const shopId = req.tenant.shopId;

    if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ message: `type must be one of ${VALID_TYPES.join(', ')}` });
    }

    try {
        const product = await prisma.product.findFirst({ where: { id: parseInt(productId), shopId } });
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const result = await prisma.$transaction(async (tx) => {
            const log = await tx.stockTransaction.create({
                data: {
                    shopId,
                    productId: product.id,
                    type,
                    quantity: parseFloat(quantity),
                    price: price ? parseFloat(price) : null,
                    description,
                },
            });

            let updateData = {};
            if (type === 'PACK_BREAK') {
                updateData = {
                    stockPacks: { decrement: parseFloat(quantity) },
                    stockLooseUnits: { increment: parseFloat(quantity) * (product.packSize || 1) },
                };
            } else if (product.stockType === 'PACK') {
                updateData = { [type === 'IN' ? 'stockPacks' : 'stockLooseUnits']: { [type === 'IN' ? 'increment' : 'decrement']: parseFloat(quantity) } };
            } else {
                const field = product.stockType === 'AREA' ? 'stockAreaCm2'
                    : product.stockType === 'LENGTH' ? 'stockLengthCm'
                        : product.stockType === 'LIQUID' ? 'stockVolumeMl' : 'stockQuantity';
                updateData = { [field]: { [type === 'IN' ? 'increment' : 'decrement']: parseFloat(quantity) } };
            }

            const updatedProduct = await tx.product.update({
                where: { id: product.id, shopId },
                data: updateData,
            });

            return { log, product: updatedProduct };
        });

        res.json({ message: 'Stock updated successfully', ...result });
    } catch (err) {
        console.error('Stock Log Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Get stock transaction history for the shop, optionally filtered by product
exports.getStockLogs = async (req, res) => {
    try {
        const { productId } = req.query;
        const shopId = req.tenant.shopId;

        const where = { shopId };
        if (productId) where.productId = parseInt(productId);

        const logs = await prisma.stockTransaction.findMany({
            where,
            include: { product: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
        });

        res.json(logs);
    } catch (err) {
        console.error('Get Stock Logs Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Get specific product stock-in detail with date range
exports.getProductStockInDetails = async (req, res) => {
    try {
        const { productId, startDate, endDate, type = 'IN' } = req.query;
        const shopId = req.tenant.shopId;

        if (!productId || !startDate || !endDate) {
            return res.status(400).json({ message: 'productId, startDate, and endDate are required' });
        }

        const where = { shopId, productId: parseInt(productId) };

        if (type !== 'all') {
            where.type = type;
        }

        where.createdAt = {
            gte: new Date(startDate + 'T00:00:00.000Z'),
            lte: new Date(endDate + 'T23:59:59.999Z'),
        };

        const logs = await prisma.stockTransaction.findMany({
            where,
            include: {
                product: { select: { name: true, purchasePrice: true, salePrice: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ success: true, logs });
    } catch (err) {
        console.error('Get Product Stock In Details Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
