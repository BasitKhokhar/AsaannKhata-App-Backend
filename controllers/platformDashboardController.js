const prisma = require('../prisma/client');

const LIVE = ['ACTIVE', 'GRACE_PERIOD'];

function pageOptions(query) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
    return { page, limit, skip: (page - 1) * limit };
}

function validId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function rangeFrom(query) {
    const now = new Date();
    const fallbackFrom = new Date(now.getTime() - 29 * 86400000);
    const fromText = query.from || fallbackFrom.toISOString().slice(0, 10);
    const toText = query.to || now.toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromText) || !/^\d{4}-\d{2}-\d{2}$/.test(toText)) return null;
    const from = new Date(`${fromText}T00:00:00.000Z`);
    const endExclusive = new Date(new Date(`${toText}T00:00:00.000Z`).getTime() + 86400000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(endExclusive.getTime()) ||
        from.toISOString().slice(0, 10) !== fromText ||
        new Date(endExclusive.getTime() - 86400000).toISOString().slice(0, 10) !== toText ||
        endExclusive <= from || endExclusive.getTime() - from.getTime() > 366 * 86400000) return null;
    return { from, endExclusive, fromText, toText };
}

function handleError(res, label, err) {
    console.error(label, err);
    return res.status(500).json({ message: 'Unable to load platform data' });
}

exports.overview = async (req, res) => {
    const range = rangeFrom(req.query);
    if (!range) return res.status(400).json({ message: 'Use a valid UTC date range of at most 366 days' });
    const createdAt = { gte: range.from, lt: range.endExclusive };
    const liveWhere = { status: { in: LIVE }, OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }] };
    try {
        const [owners, activeOwners, shops, newOwners, newShops, paidSubscriptions, salesSummary, outstanding,
            payments, verticalGroups, planGroups, recentShops, dailySales, adRewards] = await Promise.all([
            prisma.admin.count(),
            prisma.admin.count({ where: { isActive: true } }),
            prisma.shop.count(),
            prisma.admin.count({ where: { createdAt } }),
            prisma.shop.count({ where: { createdAt } }),
            prisma.userSubscription.count({ where: { ...liveWhere, isTrial: false } }),
            // The tenant guard intentionally blocks unscoped Prisma Bill reads.
            // This explicit aggregate is limited to the authenticated
            // superadmin overview route and returns no tenant rows.
            prisma.$queryRaw`SELECT COUNT(*) AS billCount, CAST(COALESCE(SUM(totalAmount), 0) AS DOUBLE) AS merchantSales
                FROM Bill WHERE isDeleted = false AND createdAt >= ${range.from} AND createdAt < ${range.endExclusive}`,
            prisma.customer.aggregate({ where: { isDeleted: false, balance: { gt: 0 } }, _sum: { balance: true } }),
            prisma.subscriptionPayment.groupBy({
                by: ['currency'], where: { paymentProvider: 'REVENUECAT', paymentStatus: 'PAID', paidAt: createdAt },
                _sum: { amount: true }, _count: { id: true },
            }),
            prisma.shop.groupBy({ by: ['shopTypeId'], _count: { id: true } }),
            prisma.userSubscription.groupBy({ by: ['planId'], where: liveWhere, _count: { id: true } }),
            prisma.shop.findMany({ take: 6, orderBy: { createdAt: 'desc' },
                select: { id: true, name: true, createdAt: true, admin: { select: { id: true, name: true } },
                    shopType: { select: { label: true } } } }),
            prisma.$queryRaw`SELECT DATE(createdAt) AS day, CAST(SUM(totalAmount) AS DOUBLE) AS sales
                FROM Bill WHERE isDeleted = false AND createdAt >= ${range.from} AND createdAt < ${range.endExclusive}
                GROUP BY DATE(createdAt) ORDER BY day ASC`,
            prisma.adCoinTransaction.count({ where: { type: 'EARNED_AD', createdAt } }),
        ]);
        const [types, plans] = await Promise.all([
            prisma.shopType.findMany({ where: { id: { in: verticalGroups.map((x) => x.shopTypeId) } }, select: { id: true, label: true } }),
            prisma.subscriptionPlan.findMany({ where: { id: { in: planGroups.map((x) => x.planId) } }, select: { id: true, code: true, name: true } }),
        ]);
        res.json({
            range: { from: range.fromText, to: range.toText },
            totals: { owners, activeOwners, shops, paidSubscriptions, newOwners, newShops,
                bills: Number(salesSummary[0]?.billCount || 0),
                merchantSales: Number(salesSummary[0]?.merchantSales || 0),
                outstandingCredit: outstanding._sum.balance || 0, adRewards },
            platformPayments: payments.map((x) => ({ currency: x.currency, amount: x._sum.amount || 0, count: x._count.id })),
            byVertical: verticalGroups.map((x) => ({ label: types.find((t) => t.id === x.shopTypeId)?.label || 'Unknown', count: x._count.id })),
            byPlan: planGroups.map((x) => ({ label: plans.find((p) => p.id === x.planId)?.name || 'Unknown', count: x._count.id })),
            dailySales: dailySales.map((x) => ({ day: x.day, sales: Number(x.sales) || 0 })),
            recentShops,
        });
    } catch (err) { return handleError(res, 'Platform overview error:', err); }
};

exports.shops = async (req, res) => {
    const { page, limit, skip } = pageOptions(req.query);
    const search = String(req.query.search || '').trim().slice(0, 100);
    const typeId = req.query.typeId ? validId(req.query.typeId) : null;
    if (req.query.typeId && !typeId) return res.status(400).json({ message: 'Invalid shop type' });
    const where = {
        ...(typeId ? { shopTypeId: typeId } : {}),
        ...(search ? { OR: [
            { name: { contains: search } }, { phone: { contains: search } },
            { admin: { is: { name: { contains: search } } } },
            { admin: { is: { email: { contains: search } } } },
        ] } : {}),
    };
    try {
        const [rows, total] = await Promise.all([
            prisma.shop.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' },
                select: { id: true, name: true, address: true, phone: true, createdAt: true,
                    admin: { select: { id: true, name: true, email: true, isActive: true } },
                    shopType: { select: { id: true, label: true, code: true } },
                    _count: { select: { products: { where: { isDeleted: false } }, bills: { where: { isDeleted: false } },
                        customers: { where: { isDeleted: false } }, devices: true } },
                } }),
            prisma.shop.count({ where }),
        ]);
        res.json({ rows, total, page, limit });
    } catch (err) { return handleError(res, 'Platform shops error:', err); }
};

exports.owners = async (req, res) => {
    const { page, limit, skip } = pageOptions(req.query);
    const search = String(req.query.search || '').trim().slice(0, 100);
    const status = String(req.query.status || 'all').toLowerCase();
    if (!['all', 'active', 'suspended'].includes(status)) return res.status(400).json({ message: 'Invalid owner status' });
    const where = {
        ...(status !== 'all' ? { isActive: status === 'active' } : {}),
        ...(search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }, { phone: { contains: search } }] } : {}),
    };
    try {
        const [rows, total] = await Promise.all([
            prisma.admin.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' },
                select: { id: true, name: true, email: true, phone: true, isActive: true, adCoins: true, createdAt: true,
                    _count: { select: { shops: true } },
                    shops: { take: 3, orderBy: { createdAt: 'asc' },
                        select: { id: true, name: true, shopType: { select: { label: true } } } },
                    subscriptions: { where: { status: { in: LIVE } }, take: 1, orderBy: { createdAt: 'desc' },
                        select: { id: true, status: true, expiryDate: true, plan: { select: { code: true, name: true, tier: true } } } },
                } }),
            prisma.admin.count({ where }),
        ]);
        res.json({ rows, total, page, limit });
    } catch (err) { return handleError(res, 'Platform owners error:', err); }
};

exports.shop = async (req, res) => {
    const id = validId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid shop ID' });
    try {
        const shop = await prisma.shop.findUnique({ where: { id },
            select: { id: true, name: true, address: true, phone: true, logo: true, createdAt: true,
                admin: { select: { id: true, name: true, email: true, phone: true, isActive: true, adCoins: true } },
                shopType: true, _count: { select: { products: { where: { isDeleted: false } }, bills: { where: { isDeleted: false } },
                    customers: { where: { isDeleted: false } }, categories: { where: { isDeleted: false } }, devices: true } } } });
        if (!shop) return res.status(404).json({ message: 'Shop not found' });
        const [sales, credit, recentBills, stockTypes, devices, recentPayments] = await Promise.all([
            prisma.bill.aggregate({ where: { shopId: id, isDeleted: false }, _sum: { totalAmount: true, remainingDue: true }, _count: { id: true } }),
            prisma.customer.aggregate({ where: { shopId: id, isDeleted: false, balance: { gt: 0 } }, _sum: { balance: true } }),
            prisma.bill.findMany({ where: { shopId: id, isDeleted: false }, take: 10, orderBy: { createdAt: 'desc' },
                select: { id: true, customerName: true, totalAmount: true, remainingDue: true, status: true, createdAt: true } }),
            prisma.product.groupBy({ by: ['stockType'], where: { shopId: id, isDeleted: false }, _count: { id: true } }),
            prisma.device.findMany({ where: { shopId: id }, orderBy: { lastSeenAt: 'desc' }, take: 12,
                select: { id: true, deviceName: true, platform: true, isActive: true, lastSeenAt: true, lastSyncAt: true } }),
            prisma.customerPayment.findMany({ where: { shopId: id, isDeleted: false }, take: 8, orderBy: { createdAt: 'desc' },
                select: { id: true, amount: true, createdAt: true, customer: { select: { id: true, name: true } } } }),
        ]);
        res.json({ shop, metrics: { lifetimeSales: sales._sum.totalAmount || 0, billBalanceDue: sales._sum.remainingDue || 0,
            customerOutstanding: credit._sum.balance || 0, bills: sales._count.id },
        recentBills, recentPayments, devices,
        stockTypes: stockTypes.map((x) => ({ type: x.stockType, count: x._count.id })) });
    } catch (err) { return handleError(res, 'Platform shop detail error:', err); }
};

exports.owner = async (req, res) => {
    const id = validId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid owner ID' });
    try {
        const owner = await prisma.admin.findUnique({ where: { id },
            select: { id: true, name: true, email: true, phone: true, isActive: true, adCoins: true,
                syncUnlockExpiresAt: true, createdAt: true, updatedAt: true,
                shops: { select: { id: true, name: true, createdAt: true, shopType: { select: { label: true } },
                    _count: { select: { products: { where: { isDeleted: false } }, bills: { where: { isDeleted: false } },
                        customers: { where: { isDeleted: false } } } } }, orderBy: { createdAt: 'desc' } },
                subscriptions: { orderBy: { createdAt: 'desc' }, take: 20,
                    select: { id: true, status: true, startDate: true, expiryDate: true, paymentProvider: true,
                        pricePaid: true, priceCurrency: true, productId: true, isTrial: true, cloudEnabled: true,
                        plan: { select: { id: true, name: true, code: true, tier: true, cloudEnabled: true } },
                        payments: { orderBy: { createdAt: 'desc' }, take: 5,
                            select: { id: true, amount: true, currency: true, paymentStatus: true, eventType: true, createdAt: true } } } },
                adCoinTransactions: { orderBy: { createdAt: 'desc' }, take: 20,
                    select: { id: true, type: true, amount: true, balanceAfter: true, createdAt: true, shop: { select: { id: true, name: true } } } },
            } });
        if (!owner) return res.status(404).json({ message: 'Owner not found' });
        const shopIds = owner.shops.map((s) => s.id);
        const [outstanding, devices] = await Promise.all([
            prisma.customer.aggregate({ where: { shopId: { in: shopIds }, isDeleted: false, balance: { gt: 0 } }, _sum: { balance: true } }),
            prisma.device.count({ where: { shopId: { in: shopIds }, isActive: true } }),
        ]);
        res.json({ owner, metrics: { outstandingCredit: outstanding._sum.balance || 0, activeDevices: devices } });
    } catch (err) { return handleError(res, 'Platform owner detail error:', err); }
};

exports.payments = async (req, res) => {
    const { page, limit, skip } = pageOptions(req.query);
    const status = String(req.query.status || '').toUpperCase();
    if (status && !['PAID', 'FAILED', 'REFUNDED', 'PENDING'].includes(status)) return res.status(400).json({ message: 'Invalid payment status' });
    const where = status ? { paymentStatus: status } : {};
    try {
        const [rows, total] = await Promise.all([
            prisma.subscriptionPayment.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' },
                select: { id: true, amount: true, currency: true, paymentProvider: true, paymentStatus: true,
                    eventType: true, transactionId: true, paidAt: true, createdAt: true,
                    subscription: { select: { admin: { select: { id: true, name: true, email: true } },
                        plan: { select: { code: true, name: true } } } } } }),
            prisma.subscriptionPayment.count({ where }),
        ]);
        res.json({ rows, total, page, limit });
    } catch (err) { return handleError(res, 'Platform payment ledger error:', err); }
};

exports.rewards = async (req, res) => {
    const { page, limit, skip } = pageOptions(req.query);
    const type = String(req.query.type || '').toUpperCase();
    if (type && !['EARNED_AD', 'SPENT_SYNC', 'SPENT_BILL'].includes(type)) return res.status(400).json({ message: 'Invalid reward type' });
    const where = type ? { type } : {};
    try {
        const [rows, total, grouped] = await Promise.all([
            prisma.adCoinTransaction.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' },
                select: { id: true, type: true, amount: true, balanceAfter: true, createdAt: true,
                    admin: { select: { id: true, name: true } }, shop: { select: { id: true, name: true } } } }),
            prisma.adCoinTransaction.count({ where }),
            prisma.adCoinTransaction.groupBy({ by: ['type'], _count: { id: true }, _sum: { amount: true } }),
        ]);
        res.json({ rows, total, page, limit, summary: grouped.map((x) => ({ type: x.type, count: x._count.id, coins: x._sum.amount || 0 })) });
    } catch (err) { return handleError(res, 'Platform reward ledger error:', err); }
};

exports.me = async (req, res) => {
    try {
        const account = await prisma.superAdmin.findUnique({ where: { id: req.superAdmin.id },
            select: { id: true, name: true, email: true, createdAt: true } });
        if (!account) return res.status(401).json({ message: 'Session no longer valid' });
        res.json({ account });
    } catch (err) { return handleError(res, 'Platform profile error:', err); }
};

exports._test = { pageOptions, validId, rangeFrom };
