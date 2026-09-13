const express = require('express');
const router = express.Router();
const adsController = require('../controllers/adsController');
const { verifyAdminToken } = require('../middleware/authMiddleware');
const tenantContext = require('../middleware/tenantContext');

router.use(verifyAdminToken, tenantContext);

router.get('/config', adsController.getConfig);
router.post('/reward', adsController.reward);
router.post('/sync/unlock', adsController.unlockSync);
// Not gated by requireSyncQuota — see the comment on syncCoinUsage: an offline
// device must always be able to reconcile its coin ledger with the server.
router.post('/coin-usage/sync', adsController.syncCoinUsage);

module.exports = router;
