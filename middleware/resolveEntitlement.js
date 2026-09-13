const { getActiveEntitlement } = require('../services/subscriptionService');

// Non-blocking sibling of requireCloudAccess — resolves req.entitlement for
// every /sync request without rejecting free-tier admins outright. Free-tier
// admins still need to reach these routes (register a device, pull, and push
// inside a coin-purchased unlock window), so the router itself can no longer
// gate on cloudEnabled; route-specific gates (requireSyncQuota on the push
// endpoints) decide what a free-tier admin is actually allowed to do.
module.exports = async function resolveEntitlement(req, res, next) {
    try {
        req.entitlement = await getActiveEntitlement(req.admin.id);
        next();
    } catch (err) {
        console.error('resolveEntitlement error:', err);
        res.status(500).json({ message: 'Server error checking subscription status' });
    }
};
