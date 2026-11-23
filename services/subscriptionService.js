const prisma = require('../prisma/client');

const LIVE_STATUSES = ['ACTIVE', 'GRACE_PERIOD'];

function freeEntitlement(plan = null) {
    return {
        subscriptionId: null,
        planName: plan?.name ?? 'Free Plan',
        startDate: null,
        billingCycle: null,
        paymentProvider: null,
        tier: plan?.tier ?? 'FREE_TRIAL',
        planCode: plan?.code ?? 'FREE_TRIAL',
        status: 'ACTIVE',
        cloudEnabled: !!plan?.cloudEnabled,
        offlineEnabled: plan?.offlineEnabled !== false,
        maxDevices: plan?.maxDevices ?? 1,
        expiryDate: null,
        isTrial: true,
        canWrite: true,
    };
}

// Single source of truth for "what can this admin do right now". Computed at
// read time from UserSubscription — never cached on Admin/Shop — so there is
// exactly one place entitlement can live, and every write path (registration,
// RevenueCat webhook, cron, superadmin manual assignment) only ever has to
// write a UserSubscription row, never a duplicated field elsewhere.
async function getActiveEntitlement(adminId) {
    const [sub, freePlan] = await Promise.all([
        prisma.userSubscription.findFirst({
            where: { adminId, status: { in: LIVE_STATUSES } },
            orderBy: { createdAt: 'desc' },
            include: { plan: true },
        }),
        prisma.subscriptionPlan.findUnique({ where: { code: 'FREE_TRIAL' } }),
    ]);

    if (!sub) {
        // A paid subscription is retained as history, but the effective plan
        // after expiry is always Free. This keeps the API response consistent
        // whether the expiry cron has already run or not.
        return freeEntitlement(freePlan);
    }

    const expired = !!sub.expiryDate && sub.expiryDate < new Date();

    if (expired) return freeEntitlement(freePlan);

    return {
        subscriptionId: sub.id,
        planName: sub.plan?.name ?? null,
        startDate: sub.startDate,
        billingCycle: sub.billingCycle,
        paymentProvider: sub.paymentProvider,
        tier: sub.plan?.tier ?? null,
        planCode: sub.plan?.code ?? null,
        status: expired ? 'EXPIRED' : sub.status,
        cloudEnabled: sub.cloudEnabled,
        offlineEnabled: sub.offlineEnabled,
        maxDevices: sub.maxDevices,
        expiryDate: sub.expiryDate,
        isTrial: sub.isTrial,
        canWrite: !expired && LIVE_STATUSES.includes(sub.status),
    };
}

// Used by registration: creates the initial FREE_TRIAL subscription for a
// brand-new Admin. Duration comes from SubscriptionPlan.durationDays (itself
// seeded at about 100 years, editable afterward via superadmin CRUD).
async function activateFreeTrial(tx, adminId) {
    const plan = await tx.subscriptionPlan.findUnique({ where: { code: 'FREE_TRIAL' } });
    if (!plan) {
        throw new Error('FREE_TRIAL plan is not seeded — run prisma/seed.js');
    }

    const durationDays = plan.durationDays ?? 36525;
    const expiryDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    return tx.userSubscription.create({
        data: {
            adminId,
            planId: plan.id,
            status: 'ACTIVE',
            isTrial: true,
            paymentProvider: 'MANUAL',
            expiryDate,
            cloudEnabled: plan.cloudEnabled,
            offlineEnabled: plan.offlineEnabled,
            maxDevices: plan.maxDevices,
        },
    });
}

module.exports = {
    getActiveEntitlement,
    activateFreeTrial,
};
