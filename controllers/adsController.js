const prisma = require('../prisma/client');
const { getActiveEntitlement } = require('../services/subscriptionService');

const SYNC_UNLOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes

function rewardAdCoinValue() {
    return Number(process.env.REWARD_AD_COIN_VALUE || 1);
}
function maxRewardAdsPerDay() {
    return Number(process.env.MAX_REWARD_ADS_PER_DAY || 15);
}
function syncCoinCost() {
    return Number(process.env.SYNC_COIN_COST || 5);
}
function freeDailyRecordLimit() {
    return Number(process.env.FREE_DAILY_RECORD_LIMIT || 15);
}
function billCoinCost() {
    return Number(process.env.BILL_COIN_COST || 1);
}

// UTC calendar day boundaries, matching this codebase's other "today" queries
// (see dashboardController's startDate/endDate range convention).
function todayUtcRange() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { start, end };
}

async function countAdsWatchedToday(adminId) {
    const { start, end } = todayUtcRange();
    return prisma.adCoinTransaction.count({
        where: { adminId, type: 'EARNED_AD', createdAt: { gte: start, lte: end } },
    });
}

// GET /ads/config
exports.getConfig = async (req, res) => {
    try {
        const adminId = req.admin.id;
        const shopId = req.tenant.shopId;
        const { start, end } = todayUtcRange();

        const [admin, entitlement, adsWatchedToday, billsUsedToday] = await Promise.all([
            prisma.admin.findUnique({ where: { id: adminId }, select: { adCoins: true, syncUnlockExpiresAt: true } }),
            getActiveEntitlement(adminId),
            countAdsWatchedToday(adminId),
            prisma.bill.count({ where: { shopId, isDeleted: false, createdAt: { gte: start, lte: end } } }),
        ]);

        const maxAds = maxRewardAdsPerDay();

        res.json({
            adCoins: admin.adCoins,
            cloudEnabled: entitlement.cloudEnabled,
            rewardAdCoinValue: rewardAdCoinValue(),
            maxRewardAdsPerDay: maxAds,
            adsWatchedToday,
            adsRemainingToday: Math.max(0, maxAds - adsWatchedToday),
            syncCoinCost: syncCoinCost(),
            freeDailyRecordLimit: freeDailyRecordLimit(),
            billCoinCost: billCoinCost(),
            billsUsedToday,
            syncUnlockExpiresAt: admin.syncUnlockExpiresAt,
        });
    } catch (err) {
        console.error('Get Ads Config Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /ads/reward — grants coins for one completed reward-ad view, capped
// per admin per UTC calendar day.
exports.reward = async (req, res) => {
    const adminId = req.admin.id;
    const shopId = req.tenant.shopId;
    const maxAds = maxRewardAdsPerDay();
    const value = rewardAdCoinValue();

    try {
        const result = await prisma.$transaction(async (tx) => {
            const { start, end } = todayUtcRange();
            const watchedToday = await tx.adCoinTransaction.count({
                where: { adminId, type: 'EARNED_AD', createdAt: { gte: start, lte: end } },
            });

            if (watchedToday >= maxAds) {
                const err = new Error(`Daily reward ad limit reached (${maxAds}/day)`);
                err.code = 'AD_LIMIT_REACHED';
                throw err;
            }

            const admin = await tx.admin.update({
                where: { id: adminId },
                data: { adCoins: { increment: value } },
            });

            await tx.adCoinTransaction.create({
                data: {
                    shopId,
                    adminId,
                    type: 'EARNED_AD',
                    amount: value,
                    balanceAfter: admin.adCoins,
                },
            });

            return { adCoins: admin.adCoins, adsWatchedToday: watchedToday + 1 };
        });

        res.json({
            success: true,
            adCoins: result.adCoins,
            adsWatchedToday: result.adsWatchedToday,
            adsRemainingToday: Math.max(0, maxAds - result.adsWatchedToday),
        });
    } catch (err) {
        if (err.code === 'AD_LIMIT_REACHED') {
            return res.status(429).json({ code: err.code, message: err.message });
        }
        console.error('Reward Ad Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /ads/sync/unlock — spends coins to open a short cloud-sync push
// window for a free-tier admin. Cloud-enabled/paid-tier admins already have
// sync, so this is a free no-op for them.
exports.unlockSync = async (req, res) => {
    const adminId = req.admin.id;
    const shopId = req.tenant.shopId;
    const cost = syncCoinCost();

    try {
        const entitlement = await getActiveEntitlement(adminId);
        if (entitlement.cloudEnabled) {
            const admin = await prisma.admin.findUnique({
                where: { id: adminId },
                select: { adCoins: true, syncUnlockExpiresAt: true },
            });
            return res.json({ success: true, adCoins: admin.adCoins, syncUnlockExpiresAt: admin.syncUnlockExpiresAt });
        }

        const result = await prisma.$transaction(async (tx) => {
            const admin = await tx.admin.findUnique({ where: { id: adminId }, select: { adCoins: true } });
            if (admin.adCoins < cost) {
                const err = new Error(`Not enough coins to unlock sync — need ${cost}, have ${admin.adCoins}`);
                err.code = 'INSUFFICIENT_COINS';
                throw err;
            }

            const syncUnlockExpiresAt = new Date(Date.now() + SYNC_UNLOCK_DURATION_MS);
            const updated = await tx.admin.update({
                where: { id: adminId },
                data: { adCoins: { decrement: cost }, syncUnlockExpiresAt },
            });

            await tx.adCoinTransaction.create({
                data: {
                    shopId,
                    adminId,
                    type: 'SPENT_SYNC',
                    amount: -cost,
                    balanceAfter: updated.adCoins,
                },
            });

            return { adCoins: updated.adCoins, syncUnlockExpiresAt: updated.syncUnlockExpiresAt };
        });

        res.json({ success: true, ...result });
    } catch (err) {
        if (err.code === 'INSUFFICIENT_COINS') {
            return res.status(402).json({ code: err.code, message: err.message });
        }
        console.error('Unlock Sync Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /ads/coin-usage/sync — reconciles coin spends an offline device already
// applied locally (e.g. a bill created past the free daily record limit).
// Deliberately NOT gated by requireSyncQuota: a device must always be able to
// reconcile its coin ledger with the server, even outside an unlock window.
// Idempotent per operation via AdCoinTransaction's (shopId, clientId) unique
// constraint — a retried operation just re-reads the row it already wrote.
exports.syncCoinUsage = async (req, res) => {
    const adminId = req.admin.id;
    const shopId = req.tenant.shopId;
    const operations = req.body.operations || [];
    const results = [];

    for (const op of operations) {
        try {
            const existing = await prisma.adCoinTransaction.findFirst({
                where: { shopId, clientId: op.clientId },
            });

            if (existing) {
                results.push({ clientId: op.clientId, success: true, adCoins: existing.balanceAfter });
                continue;
            }

            // Cost is server-defined, never trusted from the client — op.amount
            // is ignored so a tampered/buggy client can't reconcile an
            // arbitrary coin delta. Only the 'BILL' action type exists today.
            const amount = -billCoinCost();

            const created = await prisma.$transaction(async (tx) => {
                const admin = await tx.admin.update({
                    where: { id: adminId },
                    data: { adCoins: { increment: amount } },
                });

                return tx.adCoinTransaction.create({
                    data: {
                        shopId,
                        adminId,
                        type: 'SPENT_BILL',
                        amount,
                        balanceAfter: admin.adCoins,
                        clientId: op.clientId,
                    },
                });
            });

            results.push({ clientId: op.clientId, success: true, adCoins: created.balanceAfter });
        } catch (err) {
            if (err.code === 'P2002') {
                // Another request already applied this exact clientId — re-read
                // the row it wrote instead of treating this as a failure.
                const existing = await prisma.adCoinTransaction.findFirst({ where: { shopId, clientId: op.clientId } });
                results.push({ clientId: op.clientId, success: true, adCoins: existing?.balanceAfter });
                continue;
            }
            results.push({ clientId: op.clientId, success: false, error: err.message });
        }
    }

    res.json({ results });
};
