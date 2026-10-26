const express = require('express');
const router = express.Router();
const upload = require('../middleware/imageUpload');
const { createCategory, getCategories, getCategoryById, updateCategory, deleteCategory } = require('../controllers/categoriesController');
const { verifyAdminToken } = require('../middleware/authMiddleware');
const tenantContext = require('../middleware/tenantContext');
const requireActiveEntitlement = require('../middleware/requireActiveEntitlement');
const prisma = require('../prisma/client');

router.use(verifyAdminToken);

// multer must run before tenantContext on multipart routes — tenantContext
// reads req.body.shopId, which is only populated once multer parses the body.
router.post('/add', upload.single('image'), tenantContext, requireActiveEntitlement, createCategory);
router.get('/get', tenantContext, getCategories);
router.get('/get/:id', tenantContext.byResourceId(prisma.category), getCategoryById);
router.put('/update/:id', upload.single('image'), tenantContext.byResourceId(prisma.category), updateCategory);
router.delete('/delete/:id', tenantContext.byResourceId(prisma.category), deleteCategory);

module.exports = router;
