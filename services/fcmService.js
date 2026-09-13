const prisma = require('../prisma/client');
const firebaseAdmin = require('../config/firebaseAdmin');

// Sends one push notification to every active, token-registered Device
// belonging to `adminId` (across all of that admin's shops). A Firebase send
// failure must never crash the calling request — this is always a
// best-effort side effect of persisting a Notification row, never the
// primary write — so everything here is wrapped in try/catch.
async function sendToAdmin(adminId, { title, body, data } = {}) {
    try {
        const shops = await prisma.shop.findMany({ where: { adminId }, select: { id: true } });
        const shopIds = shops.map((s) => s.id);
        if (!shopIds.length) return { sent: 0 };

        const devices = await prisma.device.findMany({
            where: { shopId: { in: shopIds }, isActive: true, fcmToken: { not: null } },
        });
        if (!devices.length) return { sent: 0 };

        // FCM's data payload values must all be strings.
        const stringData = Object.fromEntries(
            Object.entries(data || {}).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])
        );

        const tokens = devices.map((d) => d.fcmToken);
        const response = await firebaseAdmin.messaging().sendEachForMulticast({
            tokens,
            notification: { title, body },
            data: stringData,
        });

        // Self-heal stale tokens so we stop retrying them on every future send.
        await Promise.all(
            (response.responses || []).map((result, index) => {
                if (!result.success && result.error?.code === 'messaging/registration-token-not-registered') {
                    const device = devices[index];
                    return prisma.device.update({
                        where: { id: device.id, shopId: device.shopId },
                        data: { fcmToken: null },
                    }).catch((err) => console.error('fcmService: failed to clear stale token:', err.message));
                }
                return null;
            })
        );

        return { sent: response.successCount || 0, failed: response.failureCount || 0 };
    } catch (err) {
        console.error('fcmService.sendToAdmin error:', err.message);
        return { sent: 0, error: err.message };
    }
}

module.exports = { sendToAdmin };
