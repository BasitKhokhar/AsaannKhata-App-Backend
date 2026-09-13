const prisma = require('../prisma/client');
const fcmService = require('../services/fcmService');

// POST /notifications/register-token — attaches an FCM token to the caller's
// already-registered Device row. Ownership check mirrors
// middleware/requireDeviceRegistered.js: the device must belong to the shop
// resolved by tenantContext.
exports.registerToken = async (req, res) => {
    try {
        const { deviceId, fcmToken } = req.body;
        if (!deviceId || !fcmToken) {
            return res.status(400).json({ message: 'deviceId and fcmToken are required' });
        }

        const device = await prisma.device.findFirst({ where: { shopId: req.tenant.shopId, deviceId } });
        if (!device) {
            return res.status(404).json({ code: 'DEVICE_NOT_REGISTERED', message: 'Register this device first via POST /sync/devices/register' });
        }

        const updated = await prisma.device.update({
            where: { id: device.id, shopId: req.tenant.shopId },
            data: { fcmToken },
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
        const { deviceId } = req.body;
        if (!deviceId) {
            return res.status(400).json({ message: 'deviceId is required' });
        }

        const device = await prisma.device.findFirst({ where: { shopId: req.tenant.shopId, deviceId } });
        if (!device) {
            return res.status(404).json({ code: 'DEVICE_NOT_REGISTERED', message: 'Device not found for this shop' });
        }

        await prisma.device.update({
            where: { id: device.id, shopId: req.tenant.shopId },
            data: { fcmToken: null },
        });

        res.json({ message: 'FCM token removed' });
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

// POST /notifications/admin/send — SuperAdmin-only. Targets either a shopId
// directly, or an adminId (resolved to that admin's first/oldest shop, since
// Notification is stored per-shop like every other tenant-scoped table here).
exports.adminSend = async (req, res) => {
    try {
        const { adminId, shopId, title, message, type, data } = req.body;

        if (!title || !message) {
            return res.status(400).json({ message: 'title and message are required' });
        }
        if (!adminId && !shopId) {
            return res.status(400).json({ message: 'adminId or shopId is required' });
        }

        let targetShop;
        if (shopId) {
            targetShop = await prisma.shop.findUnique({ where: { id: parseInt(shopId, 10) } });
        } else {
            targetShop = await prisma.shop.findFirst({ where: { adminId: parseInt(adminId, 10) }, orderBy: { id: 'asc' } });
        }

        if (!targetShop) {
            return res.status(404).json({ message: 'No shop found for the given adminId/shopId' });
        }

        const notification = await prisma.notification.create({
            data: {
                shopId: targetShop.id,
                adminId: targetShop.adminId,
                title,
                message,
                type: type || null,
                data: data || null,
            },
        });

        const push = await fcmService.sendToAdmin(targetShop.adminId, { title, body: message, data });

        res.status(201).json({ success: true, notification, push });
    } catch (err) {
        console.error('Admin Send Notification Error:', err);
        res.status(500).json({ error: err.message });
    }
};
