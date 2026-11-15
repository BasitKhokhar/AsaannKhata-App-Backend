const express = require('express');
const { verifyAdminToken } = require('../middleware/authMiddleware');
const controller = require('../controllers/engagementController');

const router = express.Router();
router.get('/home-popup', verifyAdminToken, controller.homePopup);

module.exports = router;
