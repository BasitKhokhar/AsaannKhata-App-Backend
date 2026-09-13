const prisma = require('../prisma/client');
const { getActiveEntitlement } = require('../services/subscriptionService');

// Gates the sync PUSH endpoints only (see routes/syncRoutes.js). Cloud-enabled/
// paid-tier admins always pass through for free — their plan already includes
// sync. Free-tier admins may push only inside a short unlock window they buy
// with reward-ad coins (POST /ads/sync/unlock) — see controllers/adsController.js.
module.exports = async function requireSyncQuota(req, res, next) {
    try {
        const entitlement = req.entitlement || (await getActiveEntitlement(req.admin.id));
        if (entitlement.cloudEnabled) {
            return next();
        }

        const admin = await prisma.admin.findUnique({
            where: { id: req.admin.id },
            select: { syncUnlockExpiresAt: true },
        });

        const unlocked = !!admin?.syncUnlockExpiresAt && admin.syncUnlockExpiresAt > new Date();
        if (!unlocked) {
            return res.status(402).json({
                error: 'SYNC_LOCKED',
                message: 'Sync is locked on your current plan. Watch a reward ad or spend coins to unlock cloud sync for a few minutes.',
            });
        }

        next();
    } catch (err) {
        console.error('requireSyncQuota error:', err);
        res.status(500).json({ message: 'Server error checking sync quota' });
    }
};
