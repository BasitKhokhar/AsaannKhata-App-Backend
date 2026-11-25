const prisma = require('../prisma/client');
const fcmService = require('../services/fcmService');

// POST /notifications/register-token — upserts the caller's account-scoped
// push installation. This is deliberately independent from shop sync devices.
exports.registerToken = async (req, res) => {
    try {
        const { installationId, deviceId, fcmToken, deviceName = 'AsaanKhata device', platform = 'android' } = req.body;
        const resolvedInstallationId = installationId || deviceId;
        if (!resolvedInstallationId || !fcmToken) {
            return res.status(400).json({ message: 'installationId and fcmToken are required' });
        }

        // A token belongs to the currently signed-in account. Detach it from
        // another account if this installation was used to switch accounts.
        await prisma.pushInstallation.updateMany({
            where: { fcmToken, adminId: { not: req.admin.id } },
            data: { fcmToken: null, isActive: false },
        });

        const updated = await prisma.pushInstallation.upsert({
            where: { adminId_installationId: { adminId: req.admin.id, installationId: resolvedInstallationId } },
            update: { fcmToken, deviceName, platform, isActive: true, lastSeenAt: new Date(), tokenUpdatedAt: new Date() },
            create: { adminId: req.admin.id, installationId: resolvedInstallationId, fcmToken, deviceName, platform, tokenUpdatedAt: new Date() },
        });

        console.log('[notifications] FCM token registered', {
            adminId: req.admin.id,
            installationId: resolvedInstallationId,
            platform,
            tokenPresent: true,
        });
        res.json({ message: 'FCM token registered', device: updated });
    } catch (err) {
        console.error('Register FCM Token Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE /notifications/remove-token — clears the token (e.g. on logout).
exports.removeToken = async (req, res) => {
    try {
        const installationId = req.body.installationId || req.body.deviceId;
        if (!installationId) {
            return res.status(400).json({ message: 'installationId is required' });
        }

        const result = await prisma.pushInstallation.updateMany({
            where: { adminId: req.admin.id, installationId },
            data: { fcmToken: null, isActive: false },
        });

        res.json({ message: 'FCM token removed', count: result.count });
    } catch (err) {
        console.error('Remove FCM Token Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /notifications — paginated, newest first. Same pagination shape as
// GET /billing/getallbills.
exports.list = async (req, res) => {
    try {
        const shopId = req.tenant.shopId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const where = { shopId };

        const [notifications, total] = await Promise.all([
            prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
            prisma.notification.count({ where }),
        ]);

        res.json({ success: true, notifications, total, page, limit, hasMore: skip + limit < total });
    } catch (err) {
        console.error('List Notifications Error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

// GET /notifications/unread-count
exports.unreadCount = async (req, res) => {
    try {
        const unreadCount = await prisma.notification.count({
            where: { shopId: req.tenant.shopId, isRead: false },
        });
        res.json({ unreadCount });
    } catch (err) {
        console.error('Get Unread Notification Count Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /notifications/:id/read
exports.markRead = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) {
            return res.status(400).json({ message: 'Valid id is required' });
        }

        const notification = await prisma.notification.findFirst({ where: { id, shopId: req.tenant.shopId } });
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        const updated = await prisma.notification.update({
            where: { id: notification.id },
            data: { isRead: true },
        });

        res.json({ message: 'Notification marked as read', notification: updated });
    } catch (err) {
        console.error('Mark Notification Read Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /notifications/mark-all-read
exports.markAllRead = async (req, res) => {
    try {
        const result = await prisma.notification.updateMany({
            where: { shopId: req.tenant.shopId, isRead: false },
            data: { isRead: true },
        });

        res.json({ message: 'All notifications marked as read', count: result.count });
    } catch (err) {
        console.error('Mark All Notifications Read Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /notifications/admin/send — SuperAdmin-only. Sends to all active owners
// by default, or to an explicit list of owner IDs.
exports.adminSend = async (req, res) => {
    try {
        const { adminId, adminIds, sendToAll, shopId, title, message, type, data } = req.body;

        console.log('[notifications] Admin send requested', {
            sendToAll: Boolean(sendToAll),
            adminId: adminId || null,
            adminIdsCount: Array.isArray(adminIds) ? adminIds.length : 0,
            shopId: shopId || null,
            title,
        });

        if (!title || !message) {
            return res.status(400).json({ message: 'title and message are required' });
        }
        const requestedIds = Array.isArray(adminIds) ? [...new Set(adminIds.map((id) => parseInt(id, 10)).filter(Number.isInteger))] : [];
        if (!sendToAll && !requestedIds.length && !adminId && !shopId) {
            return res.status(400).json({ message: 'Select at least one recipient' });
        }

        let targetAdmins;
        if (sendToAll) {
            targetAdmins = await prisma.admin.findMany({ where: { shops: { some: {} } }, select: { id: true } });
        } else if (requestedIds.length) {
            targetAdmins = await prisma.admin.findMany({ where: { id: { in: requestedIds }, shops: { some: {} } }, select: { id: true } });
        } else if (shopId) {
            const targetShop = await prisma.shop.findUnique({ where: { id: parseInt(shopId, 10) }, select: { adminId: true } });
            targetAdmins = targetShop ? [{ id: targetShop.adminId }] : [];
        } else {
            targetAdmins = await prisma.admin.findMany({ where: { id: parseInt(adminId, 10), shops: { some: {} } }, select: { id: true } });
        }

        if (!targetAdmins.length) {
            return res.status(404).json({ message: 'No eligible users found for this notification' });
        }

        const notifications = [];
        const pushes = [];
        for (const target of targetAdmins) {
            const targetShop = await prisma.shop.findFirst({ where: { adminId: target.id }, orderBy: { id: 'asc' } });
            if (!targetShop) continue;
            const notification = await prisma.notification.create({ data: { shopId: targetShop.id, adminId: target.id, title, message, type: type || null, data: data || null } });
            notifications.push(notification);
            // Include the persisted inbox ID in the FCM data payload so the
            // mobile app can correlate a received push with this exact row.
            pushes.push(await fcmService.sendToAdmin(target.id, { title, body: message, data, notificationId: notification.id }));
        }

        res.status(201).json({
            success: true,
            recipientCount: notifications.length,
            notifications,
            push: {
                targeted: pushes.reduce((sum, item) => sum + (item.targeted || 0), 0),
                accepted: pushes.reduce((sum, item) => sum + (item.accepted ?? item.sent ?? 0), 0),
                sent: pushes.reduce((sum, item) => sum + (item.accepted ?? item.sent ?? 0), 0),
                failed: pushes.reduce((sum, item) => sum + (item.failed || 0), 0),
                details: pushes.map(({ targeted, accepted, sent, failed, reason, error, errorCode, failures }) => ({
                    targeted,
                    accepted,
                    sent,
                    failed,
                    reason,
                    error,
                    errorCode,
                    failures,
                })),
            },
        });
        console.log('[notifications] Admin send completed', {
            recipientCount: notifications.length,
            targeted: pushes.reduce((sum, item) => sum + (item.targeted || 0), 0),
            accepted: pushes.reduce((sum, item) => sum + (item.accepted ?? item.sent ?? 0), 0),
            failed: pushes.reduce((sum, item) => sum + (item.failed || 0), 0),
        });
    } catch (err) {
        console.error('Admin Send Notification Error:', err);
        res.status(500).json({ error: err.message });
    }
};
