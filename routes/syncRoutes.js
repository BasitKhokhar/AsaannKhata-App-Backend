const express = require('express');
const router = express.Router();
const syncController = require('../controllers/syncController');
const { verifyAdminToken } = require('../middleware/authMiddleware');
const tenantContext = require('../middleware/tenantContext');
const resolveEntitlement = require('../middleware/resolveEntitlement');
const requireDeviceRegistered = require('../middleware/requireDeviceRegistered');
const requireSyncQuota = require('../middleware/requireSyncQuota');

// Every /sync/* route requires a valid admin JWT, a shop the admin owns (sent
// as shopId in the body/query/header), and the admin's resolved entitlement
// (req.entitlement) — applied here at the router level so no future endpoint
// can be added to this file without inheriting at least that much.
//
// Unlike before the ads/reward-coins economy, this no longer hard-blocks
// free-tier admins with requireCloudAccess: they still need to register a
// device, check status, and pull. Only the PUSH endpoints below are gated —
// for a free-tier admin, by requireSyncQuota's coin-purchased unlock window
// (see POST /ads/sync/unlock); cloud-enabled/paid-tier admins pass through
// requireSyncQuota for free, same as before.
router.use(verifyAdminToken, tenantContext, resolveEntitlement);

router.post('/devices/register', syncController.registerDevice);
router.get('/status', syncController.status);

router.get('/pull', requireDeviceRegistered, syncController.pull);
router.post('/push/categories', requireDeviceRegistered, requireSyncQuota, syncController.pushCategories);
router.post('/push/products', requireDeviceRegistered, requireSyncQuota, syncController.pushProducts);
router.post('/push/stock-adjustments', requireDeviceRegistered, requireSyncQuota, syncController.pushStockAdjustments);
router.post('/push/bills', requireDeviceRegistered, requireSyncQuota, syncController.pushBills);
router.post('/push/customers', requireDeviceRegistered, requireSyncQuota, syncController.pushCustomers);
router.post('/push/customer-payments', requireDeviceRegistered, requireSyncQuota, syncController.pushCustomerPayments);

module.exports = router;
