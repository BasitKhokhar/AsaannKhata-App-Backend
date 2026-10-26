const express = require('express');
const router = express.Router();
const upload = require('../middleware/imageUpload');
const { createProduct, getProducts, getAllProducts, getProductById, updateProduct, deleteProduct, searchProducts } = require('../controllers/productsController');
const { verifyAdminToken } = require('../middleware/authMiddleware');
const tenantContext = require('../middleware/tenantContext');
const requireActiveEntitlement = require('../middleware/requireActiveEntitlement');
const prisma = require('../prisma/client');

router.use(verifyAdminToken);

// multer must run before tenantContext on multipart routes — tenantContext
// reads req.body.shopId, which is only populated once multer parses the body.
router.post('/add', upload.single('image'), tenantContext, requireActiveEntitlement, createProduct);
router.get('/getproducts', tenantContext, getProducts);
router.get('/getallproducts/:shopId', tenantContext, getAllProducts);
router.get('/getproduct/:id', tenantContext.byResourceId(prisma.product), getProductById);
router.get('/search', tenantContext, searchProducts);
router.put('/updateproduct/:id', upload.single('image'), tenantContext.byResourceId(prisma.product), updateProduct);
router.delete('/deleteproduct/:id', tenantContext.byResourceId(prisma.product), deleteProduct);

module.exports = router;
