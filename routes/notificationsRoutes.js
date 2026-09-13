const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notificationsController');
const { verifyAdminToken, verifySuperAdminToken } = require('../middleware/authMiddleware');
const tenantContext = require('../middleware/tenantContext');

// SuperAdmin-only broadcast endpoint — registered before the tenant-scoped
// router.use() below so it never inherits the admin JWT / tenantContext gate.
router.post('/admin/send', verifySuperAdminToken, notificationsController.adminSend);

router.use(verifyAdminToken, tenantContext);

router.post('/register-token', notificationsController.registerToken);
router.delete('/remove-token', notificationsController.removeToken);
router.get('/', notificationsController.list);
router.get('/unread-count', notificationsController.unreadCount);
router.put('/:id/read', notificationsController.markRead);
router.put('/mark-all-read', notificationsController.markAllRead);

module.exports = router;
