// One-off data migration: grandfather every pre-existing Admin (created
// before the subscription system existed) onto the permanent single-shop
// Lifetime plan
// (offline-only, no expiry, MANUAL provider) so they're never blocked by
// the new entitlement checks. Safe to re-run — skips admins that already
// have a subscription.
//
// Run once, after `prisma migrate deploy` and `node prisma/seed.js`:
//   node prisma/migrate-scripts/backfillAdminSubscriptions.js
require('dotenv').config();
const prisma = require('../client');

async function main() {
    const lifetimePlan = await prisma.subscriptionPlan.findUnique({ where: { code: 'LIFETIME_SINGLE_SHOP' } });
    if (!lifetimePlan) {
        throw new Error('LIFETIME_SINGLE_SHOP plan not found — run `node prisma/seed.js` first.');
    }

    const admins = await prisma.admin.findMany({
        where: { subscriptions: { none: {} } },
        select: { id: true, email: true },
    });

    if (admins.length === 0) {
        console.log('No admins need backfilling — every admin already has a subscription.');
        return;
    }

    for (const admin of admins) {
        await prisma.userSubscription.create({
            data: {
                adminId: admin.id,
                planId: lifetimePlan.id,
                status: 'ACTIVE',
                isTrial: false,
                paymentProvider: 'MANUAL',
                expiryDate: null,
                cloudEnabled: lifetimePlan.cloudEnabled,
                offlineEnabled: lifetimePlan.offlineEnabled,
                maxDevices: lifetimePlan.maxDevices,
            },
        });
        console.log(`  + granted LIFETIME_SINGLE_SHOP to admin #${admin.id} (${admin.email})`);
    }

    console.log(`Backfilled ${admins.length} admin(s) onto the LIFETIME_SINGLE_SHOP plan.`);
}

main()
    .catch((err) => {
        console.error('Backfill failed:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
