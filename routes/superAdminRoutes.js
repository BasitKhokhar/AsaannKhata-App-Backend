const express = require('express');
const router = express.Router();
const {
    createPlan,
    getAllPlans,
    updatePlan,
    deactivatePlan,
    assignSubscription,
    getAllAdmins,
    setAdminStatus,
} = require('../controllers/superAdminController');
const { verifySuperAdminToken } = require('../middleware/authMiddleware');
const platform = require('../controllers/platformDashboardController');

router.use(verifySuperAdminToken);

// Platform console reads. Keep these behind the superadmin role gate; none
// of these endpoints may be called with a shop-owner token.
router.get('/me', platform.me);
router.get('/overview', platform.overview);
router.get('/shops', platform.shops);
router.get('/shops/:id', platform.shop);
router.get('/owners', platform.owners);
router.get('/owners/:id', platform.owner);
router.get('/payments', platform.payments);
router.get('/rewards', platform.rewards);

// Plan CRUD
router.post('/plans/add', createPlan);
router.get('/plans/all', getAllPlans);
router.put('/plans/update/:id', updatePlan);
router.delete('/plans/deactivate/:id', deactivatePlan);

// Manual subscription assignment (bank transfer sales, goodwill extensions)
router.post('/subscriptions/assign', assignSubscription);

// Admin (tenant) management
router.get('/admins', getAllAdmins);
router.put('/admins/:id/status', setAdminStatus);

module.exports = router;
