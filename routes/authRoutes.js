const express = require('express');
const router = express.Router();
const { rateLimit } = require('express-rate-limit');
const { register, adminLogin, adminRefresh, updateAdminPassword, requestPasswordReset, resetPassword } = require('../controllers/authController');
const { superAdminLogin, superAdminRefresh, updateSuperAdminPassword } = require('../controllers/superAdminController');
const { verifyAdminToken, verifySuperAdminToken } = require('../middleware/authMiddleware');
const max = Number(process.env.AUTH_RATE_LIMIT_MAX);
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number.isSafeInteger(max) && max > 0 ? max : 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many authentication attempts. Try again later.' } });
router.use(authLimit);

// Admin (shop owner) auth
router.post('/admin/register', register);
router.post('/admin/login', adminLogin);
router.post('/admin/refresh', adminRefresh);
router.post('/admin/password-reset/request', requestPasswordReset);
router.post('/admin/password-reset/confirm', resetPassword);
router.put('/admin/update-password', verifyAdminToken, updateAdminPassword);

// Superadmin (platform) auth
router.post('/superadmin/login', superAdminLogin);
router.post('/superadmin/refresh', superAdminRefresh);
router.put('/superadmin/update-password', verifySuperAdminToken, updateSuperAdminPassword);

module.exports = router;
