const prisma = require('../prisma/client');
const firebaseAdmin = require('../config/firebaseAdmin');

// Sends one push notification to every active, token-registered installation
// belonging to `adminId`. Push registrations are account-scoped, unlike sync
// devices which are shop-scoped. A Firebase send
// failure must never crash the calling request — this is always a
// best-effort side effect of persisting a Notification row, never the
// primary write — so everything here is wrapped in try/catch.
async function sendToAdmin(adminId, { title, body, data, notificationId } = {}) {
    try {
        const installations = await prisma.pushInstallation.findMany({
            where: { adminId, isActive: true, fcmToken: { not: null } },
        });
        if (!installations.length) return { sent: 0, accepted: 0, targeted: 0, failed: 0 };

        // FCM's data payload values must all be strings.
        const stringData = Object.fromEntries(
            Object.entries(data || {}).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])
        );
        if (notificationId != null) stringData.notificationId = String(notificationId);
        stringData.source = 'backend-fcm';

        const tokens = [...new Set(installations.map((d) => d.fcmToken).filter(Boolean))];
        const response = await firebaseAdmin.messaging().sendEachForMulticast({
            tokens,
            notification: { title, body },
            data: stringData,
        });

        // Self-heal stale tokens so we stop retrying them on every future send.
        await Promise.all(
            (response.responses || []).map((result, index) => {
                if (!result.success && result.error?.code === 'messaging/registration-token-not-registered') {
                    const token = tokens[index];
                    return prisma.pushInstallation.updateMany({
                        where: { fcmToken: token },
                        data: { fcmToken: null, isActive: false },
                    }).catch((err) => console.error('fcmService: failed to clear stale token:', err.message));
                }
                return null;
            })
        );

        return {
            accepted: response.successCount || 0,
            sent: response.successCount || 0,
            failed: response.failureCount || 0,
            targeted: tokens.length,
        };
    } catch (err) {
        console.error('fcmService.sendToAdmin error:', err.message);
        return { sent: 0, error: err.message };
    }
}

module.exports = { sendToAdmin };
