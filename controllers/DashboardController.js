const prisma = require('../prisma/client');
const analyticsService = require('../services/analyticsService');

function stockUnitsFor(product) {
    switch (product.stockType) {
        case 'AREA':
            return product.stockAreaCm2 || 0;
        case 'LENGTH':
            return product.stockLengthCm || 0;
        case 'PACK':
            return (product.stockPacks || 0) * (product.packSize || 1) + (product.stockLooseUnits || 0);
        default:
            return product.stockQuantity || 0;
    }
}

function billItemUnitsFor(item) {
    switch (item.stockType) {
        case 'AREA':
            return item.totalArea || 0;
        case 'LENGTH':
            return item.lengthCm || 0;
        case 'PACK':
            return item.total || 0; // pack-mode cost/sale already priced per whole line in `total`
        default:
            return item.quantity || 0;
    }
}

/**
 * Get Dashboard Stats
 * URL: /dashboard/stats
 * Method: GET
 */
exports.getDashboardStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const shopId = req.tenant.shopId;

        const where = { shopId, isDeleted: false };
        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate + 'T00:00:00.000Z'),
                lte: new Date(endDate + 'T23:59:59.999Z'),
            };
        }

        // 1. Calculate Summary Stats
        const bills = await prisma.bill.findMany({
            where,
            include: {
                items: {
                    include: { product: { select: { purchasePrice: true, packPurchasePrice: true, packSize: true } } },
                },
            },
        });

        const totalSales = bills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);
        const orderCount = bills.length;

        const totalRevenue = bills.reduce((sum, bill) => {
            const billProfit = bill.items.reduce((itemSum, item) => {
                const itemSalePrice = item.total || 0;
                const costPricePerBaseUnit = item.product?.purchasePrice || 0;

                let factor;
                if (item.stockType === 'PACK') {
                    const packSize = item.product?.packSize || 1;
                    factor = (item.packQuantity || 0) * packSize + (item.looseQuantity || 0);
                } else {
                    factor = billItemUnitsFor(item);
                }

                const itemCostPrice = costPricePerBaseUnit * factor;
                return itemSum + (itemSalePrice - itemCostPrice);
            }, 0);
            return sum + billProfit;
        }, 0);

        // 2. Total Inventory Value
        const products = await prisma.product.findMany({
            where: { shopId, isDeleted: false },
            select: {
                stockType: true,
                stockQuantity: true,
                stockAreaCm2: true,
                stockLengthCm: true,
                stockPacks: true,
                stockLooseUnits: true,
                packSize: true,
                salePrice: true,
                packSalePrice: true,
                name: true,
                id: true,
                lowStockThreshold: true,
            },
        });

        const totalInventoryValue = products.reduce((sum, prod) => {
            if (prod.stockType === 'PACK') {
                const packSize = prod.packSize || 1;
                const packSaleValue = prod.packSalePrice || prod.salePrice * packSize;
                return sum + (prod.stockPacks || 0) * packSaleValue + (prod.stockLooseUnits || 0) * prod.salePrice;
            }
            return sum + prod.salePrice * stockUnitsFor(prod);
        }, 0);

        // 3. Low Stock Alerts (configured threshold in each mode's display units)
        const lowStockAlerts = products
            .filter((prod) => prod.lowStockThreshold != null && (prod.stockType === 'PACK' ? (prod.stockPacks || 0) + (prod.stockLooseUnits || 0) : stockUnitsFor(prod)) <= prod.lowStockThreshold)
            .map((prod) => ({
                id: `PRD-${prod.id}`,
                name: prod.name,
                stock: stockUnitsFor(prod),
            }))
            .slice(0, 5);

        // 4. Revenue Analytics (Grouped by Day)
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const analyticsMap = {};

        bills.forEach((bill) => {
            const date = new Date(bill.createdAt);
            const label = days[date.getDay()];
            analyticsMap[label] = (analyticsMap[label] || 0) + bill.totalAmount;
        });

        const revenueAnalytics = days.map((day) => ({
            label: day,
            value: analyticsMap[day] || 0,
        }));

        // 5. Recent Invoices
        const recentInvoices = await prisma.bill.findMany({
            where: { shopId, isDeleted: false },
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: { id: true, customerName: true, totalAmount: true, createdAt: true },
        });

        const formattedRecentInvoices = recentInvoices.map((inv) => ({
            id: `INV-${inv.id}`,
            customer: inv.customerName,
            amount: inv.totalAmount,
            date: inv.createdAt.toISOString(),
        }));

        res.json({
            summary: {
                totalSales: parseFloat(totalSales.toFixed(2)),
                totalRevenue: parseFloat(totalRevenue.toFixed(2)),
                orderCount,
                totalInventoryValue: parseFloat(totalInventoryValue.toFixed(2)),
            },
            revenueAnalytics,
            lowStockAlerts,
            recentInvoices: formattedRecentInvoices,
        });
    } catch (err) {
        console.error('Get Dashboard Stats Error:', err);
        res.status(500).json({ status: 'error', message: 'Server error', error: err.message });
    }
};

/**
 * Sales Trend (week/month/year buckets)
 * URL: /dashboard/analytics/sales-trend
 * Method: GET
 */
exports.getSalesTrend = async (req, res) => {
    try {
        const { period, startDate, endDate } = req.query;
        const shopId = req.tenant.shopId;
        const data = await analyticsService.getSalesTrend({ shopId, period, startDate, endDate });
        res.json({ period: period || 'week', data });
    } catch (err) {
        console.error('Get Sales Trend Error:', err);
        res.status(500).json({ status: 'error', message: 'Server error', error: err.message });
    }
};

/**
 * Sales By Product
 * URL: /dashboard/analytics/by-product
 * Method: GET
 */
exports.getSalesByProduct = async (req, res) => {
    try {
        const { startDate, endDate, limit } = req.query;
        const shopId = req.tenant.shopId;
        const data = await analyticsService.getSalesByProduct({
            shopId,
            startDate,
            endDate,
            limit: limit ? parseInt(limit, 10) : undefined,
        });
        res.json({ data });
    } catch (err) {
        console.error('Get Sales By Product Error:', err);
        res.status(500).json({ status: 'error', message: 'Server error', error: err.message });
    }
};

/**
 * Sales By Category
 * URL: /dashboard/analytics/by-category
 * Method: GET
 */
exports.getSalesByCategory = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const shopId = req.tenant.shopId;
        const data = await analyticsService.getSalesByCategory({ shopId, startDate, endDate });
        res.json({ data });
    } catch (err) {
        console.error('Get Sales By Category Error:', err);
        res.status(500).json({ status: 'error', message: 'Server error', error: err.message });
    }
};

/**
 * Profit Margin Trend (week/month/year buckets)
 * URL: /dashboard/analytics/profit-margin
 * Method: GET
 */
exports.getProfitMarginTrend = async (req, res) => {
    try {
        const { period, startDate, endDate } = req.query;
        const shopId = req.tenant.shopId;
        const data = await analyticsService.getProfitMarginTrend({ shopId, period, startDate, endDate });
        res.json({ period: period || 'week', data });
    } catch (err) {
        console.error('Get Profit Margin Trend Error:', err);
        res.status(500).json({ status: 'error', message: 'Server error', error: err.message });
    }
};

function csvEscape(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function rowsToCsv(rows) {
    if (!rows.length) return '';
    const columns = Object.keys(rows[0]);
    const header = columns.map(csvEscape).join(',');
    const lines = rows.map((row) => columns.map((col) => csvEscape(row[col])).join(','));
    return [header, ...lines].join('\n');
}

/**
 * Export Analytics as CSV
 * URL: /dashboard/export
 * Method: GET
 */
exports.exportAnalyticsCsv = async (req, res) => {
    try {
        const { report, period, startDate, endDate } = req.query;
        const shopId = req.tenant.shopId;

        if (!report) {
            return res.status(400).json({ status: 'error', message: 'Missing required query param: report' });
        }

        const rows = await analyticsService.buildExportRows({ shopId, report, period, startDate, endDate });
        const csv = rowsToCsv(rows);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${report}-${Date.now()}.csv"`);
        res.send(csv);
    } catch (err) {
        console.error('Export Analytics CSV Error:', err);
        res.status(500).json({ status: 'error', message: 'Server error', error: err.message });
    }
};
