const express = require('express');
const router = express.Router();
const { register, adminLogin, adminRefresh, updateAdminPassword } = require('../controllers/authController');
const { superAdminLogin, superAdminRefresh, updateSuperAdminPassword } = require('../controllers/superAdminController');
const { verifyAdminToken, verifySuperAdminToken } = require('../middleware/authMiddleware');

// Admin (shop owner) auth
router.post('/admin/register', register);
router.post('/admin/login', adminLogin);
router.post('/admin/refresh', adminRefresh);
router.put('/admin/update-password', verifyAdminToken, updateAdminPassword);

// Superadmin (platform) auth
router.post('/superadmin/login', superAdminLogin);
router.post('/superadmin/refresh', superAdminRefresh);
router.put('/superadmin/update-password', verifySuperAdminToken, updateSuperAdminPassword);

module.exports = router;
