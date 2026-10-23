const syncService = require('../services/syncService');

exports.registerDevice = async (req, res) => {
    try {
        const registered = await syncService.registerDevice(req.tenant, req.body, req.entitlement.maxDevices);
        const device = await require('../prisma/client').device.update({
            where: { id: registered.id, shopId: req.tenant.shopId },
            data: { lastSyncAt: new Date() },
        });
        res.status(201).json({ message: 'Device registered', device });
    } catch (err) {
        if (err.code === 'DEVICE_LIMIT_REACHED') {
            return res.status(403).json({ code: err.code, message: err.message });
        }
        if (err.code === 'DEVICE_ID_REQUIRED') {
            return res.status(400).json({ code: err.code, message: err.message });
        }
        console.error('Register Device Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.pull = async (req, res) => {
    try {
        const result = await syncService.pullChanges(req.tenant, req.query.since);
        res.json(result);
    } catch (err) {
        console.error('Sync Pull Error:', err);
        res.status(500).json({ error: err.message });
    }
};

function makePushHandler(fn) {
    return async (req, res) => {
        try {
            const deviceId = req.headers['x-device-id'];
            const results = await fn(req.tenant, deviceId, req.body.operations);
            res.json({ results });
        } catch (err) {
            console.error('Sync Push Error:', err);
            res.status(500).json({ error: err.message });
        }
    };
}

exports.pushCategories = makePushHandler(syncService.pushCategories);
exports.pushProducts = makePushHandler(syncService.pushProducts);
exports.pushStockAdjustments = makePushHandler(syncService.pushStockAdjustments);
exports.pushBills = makePushHandler(syncService.pushBills);
exports.pushCustomers = makePushHandler(syncService.pushCustomers);
exports.pushCustomerPayments = makePushHandler(syncService.pushCustomerPayments);
exports.pushExpenses = makePushHandler(syncService.pushExpenses);

exports.status = async (req, res) => {
    try {
        const status = await syncService.getSyncStatus(req.tenant, req.entitlement);
        res.json(status);
    } catch (err) {
        console.error('Sync Status Error:', err);
        res.status(500).json({ error: err.message });
    }
};
