const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notificationsController');
const supportController = require('../controllers/supportController');
const { verifyAdminToken, verifySuperAdminToken } = require('../middleware/authMiddleware');
const tenantContext = require('../middleware/tenantContext');
const resolveEntitlement = require('../middleware/resolveEntitlement');

// SuperAdmin-only broadcast endpoint — registered before the tenant-scoped
// router.use() below so it never inherits the admin JWT / tenantContext gate.
router.post('/admin/send', verifySuperAdminToken, notificationsController.adminSend);

// Push registration is account-scoped; it must not require a shop or consume
// a shop sync-device slot.
router.post('/register-token', verifyAdminToken, notificationsController.registerToken);
router.delete('/remove-token', verifyAdminToken, notificationsController.removeToken);

router.use(verifyAdminToken, tenantContext, resolveEntitlement);
router.post('/support-requests', supportController.create);
router.get('/', notificationsController.list);
router.get('/unread-count', notificationsController.unreadCount);
router.put('/:id/read', notificationsController.markRead);
router.put('/mark-all-read', notificationsController.markAllRead);

module.exports = router;
