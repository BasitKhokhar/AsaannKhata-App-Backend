const prisma = require('../prisma/client');
const { dateRange } = require('../utils/dateRange');

// Same profit-per-line-item formula as DashboardController.getDashboardStats —
// kept in one place so sales-by-product/category/margin all agree with the
// existing /dashboard/stats numbers instead of drifting into a second formula.
function billItemProfit(item) {
    const itemSalePrice = item.total || 0;
    const costPricePerBaseUnit = item.product?.purchasePrice || 0;

    let factor;
    if (item.stockType === 'PACK') {
        const packSize = item.product?.packSize || 1;
        factor = (item.packQuantity || 0) * packSize + (item.looseQuantity || 0);
    } else if (item.stockType === 'AREA') {
        factor = item.totalArea || 0;
    } else if (item.stockType === 'LENGTH') {
        factor = item.lengthCm || 0;
    } else if (item.stockType === 'LIQUID') {
        factor = item.volumeMl || 0;
    } else {
        factor = item.quantity || 0;
    }

    const itemCostPrice = costPricePerBaseUnit * factor;
    return itemSalePrice - itemCostPrice;
}

function dateRangeWhere(startDate, endDate) {
    const createdAt = dateRange(startDate, endDate);
    return createdAt ? { createdAt } : {};
}

function bucketKeyFor(date, period) {
    if (period === 'year') {
        return date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }); // Jan, Feb, ...
    }
    if (period === 'month') {
        return String(date.getUTCDate()); // 1..31
    }
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getUTCDay()]; // week (default)
}

function bucketOrderFor(period) {
    if (period === 'year') {
        return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }
    if (period === 'month') {
        return Array.from({ length: 31 }, (_, i) => String(i + 1));
    }
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
}

async function fetchBillsWithItems(shopId, startDate, endDate) {
    return prisma.bill.findMany({
        where: { shopId, isDeleted: false, ...dateRangeWhere(startDate, endDate) },
        include: {
            items: {
                include: { product: { select: { purchasePrice: true, packSize: true } } },
            },
        },
    });
}

async function getSalesTrend({ shopId, period = 'week', startDate, endDate }) {
    const bills = await fetchBillsWithItems(shopId, startDate, endDate);

    const buckets = {};
    for (const bill of bills) {
        const key = bucketKeyFor(new Date(bill.createdAt), period);
        if (!buckets[key]) buckets[key] = { revenue: 0, orderCount: 0 };
        buckets[key].revenue += bill.totalAmount || 0;
        buckets[key].orderCount += 1;
    }

    return bucketOrderFor(period).map((label) => ({
        label,
        revenue: parseFloat((buckets[label]?.revenue || 0).toFixed(2)),
        orderCount: buckets[label]?.orderCount || 0,
    }));
}

async function getSalesByProduct({ shopId, startDate, endDate, limit = 10 }) {
    const bills = await fetchBillsWithItems(shopId, startDate, endDate);

    const byProduct = {};
    for (const bill of bills) {
        for (const item of bill.items) {
            const key = item.productId;
            if (!byProduct[key]) {
                byProduct[key] = { productId: item.productId, name: item.productName, revenue: 0, profit: 0, quantitySold: 0 };
            }
            byProduct[key].revenue += item.total || 0;
            byProduct[key].profit += billItemProfit(item);
            byProduct[key].quantitySold += item.quantity || item.packQuantity || item.totalArea || item.lengthCm || item.volumeMl || 0;
        }
    }

    return Object.values(byProduct)
        .map((p) => ({
            ...p,
            revenue: parseFloat(p.revenue.toFixed(2)),
            profit: parseFloat(p.profit.toFixed(2)),
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit);
}

async function getSalesByCategory({ shopId, startDate, endDate }) {
    const bills = await fetchBillsWithItems(shopId, startDate, endDate);

    const productIds = [...new Set(bills.flatMap((b) => b.items.map((i) => i.productId)))];
    const products = await prisma.product.findMany({
        where: { shopId, id: { in: productIds } },
        select: { id: true, categoryId: true, category: { select: { name: true } } },
    });
    const categoryByProductId = new Map(products.map((p) => [p.id, p.category?.name || 'Uncategorized']));

    const byCategory = {};
    for (const bill of bills) {
        for (const item of bill.items) {
            const key = categoryByProductId.get(item.productId) || 'Uncategorized';
            if (!byCategory[key]) byCategory[key] = { category: key, revenue: 0, profit: 0 };
            byCategory[key].revenue += item.total || 0;
            byCategory[key].profit += billItemProfit(item);
        }
    }

    return Object.values(byCategory)
        .map((c) => ({ ...c, revenue: parseFloat(c.revenue.toFixed(2)), profit: parseFloat(c.profit.toFixed(2)) }))
        .sort((a, b) => b.revenue - a.revenue);
}

async function getProfitMarginTrend({ shopId, period = 'week', startDate, endDate }) {
    const bills = await fetchBillsWithItems(shopId, startDate, endDate);

    const buckets = {};
    for (const bill of bills) {
        const key = bucketKeyFor(new Date(bill.createdAt), period);
        if (!buckets[key]) buckets[key] = { revenue: 0, profit: 0 };
        const billProfit = bill.items.reduce((sum, item) => sum + billItemProfit(item), 0);
        buckets[key].revenue += bill.totalAmount || 0;
        buckets[key].profit += billProfit;
    }

    return bucketOrderFor(period).map((label) => {
        const revenue = buckets[label]?.revenue || 0;
        const profit = buckets[label]?.profit || 0;
        return {
            label,
            revenue: parseFloat(revenue.toFixed(2)),
            profit: parseFloat(profit.toFixed(2)),
            marginPct: revenue > 0 ? parseFloat(((profit / revenue) * 100).toFixed(2)) : 0,
        };
    });
}

async function buildExportRows({ shopId, startDate, endDate, report, period = 'week' }) {
    switch (report) {
        case 'sales-trend':
            return getSalesTrend({ shopId, period, startDate, endDate });
        case 'by-product':
            return getSalesByProduct({ shopId, startDate, endDate, limit: 1000 });
        case 'by-category':
            return getSalesByCategory({ shopId, startDate, endDate });
        case 'profit-margin':
            return getProfitMarginTrend({ shopId, period, startDate, endDate });
        default:
            throw new Error(`Unknown report type: ${report}`);
    }
}

module.exports = {
    getSalesTrend,
    getSalesByProduct,
    getSalesByCategory,
    getProfitMarginTrend,
    buildExportRows,
};
