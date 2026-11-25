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
        console.log('[fcm] Preparing send', { adminId, activeInstallations: installations.length });
        if (!installations.length) {
            console.warn('[fcm] No active FCM token found for recipient', { adminId });
            return { sent: 0, accepted: 0, targeted: 0, failed: 0, reason: 'no-active-token' };
        }

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

        const failures = (response.responses || [])
            .map((result, index) => ({ index, code: result.error?.code || 'unknown-error', message: result.error?.message || null }))
            .filter((result) => result.code !== 'unknown-error' || result.message);
        console.log('[fcm] Send completed', {
            adminId,
            targeted: tokens.length,
            accepted: response.successCount || 0,
            failed: response.failureCount || 0,
            failures,
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
            failures,
        };
    } catch (err) {
        console.error('[fcm] Send failed', { adminId, code: err.code || null, message: err.message });
        return { sent: 0, accepted: 0, targeted: 0, failed: 1, error: err.message, errorCode: err.code || null };
    }
}

module.exports = { sendToAdmin };
