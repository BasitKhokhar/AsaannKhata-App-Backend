const prisma = require('../prisma/client');
const bucketStorage = require('../utils/bucketStorage');
const { seedDefaultCategoriesForShop } = require('../services/shopTypeService');
const upload = require('../middleware/imageUpload');

// Create an additional shop under the same admin (the first shop is created
// as part of POST /auth/admin/register, not here).
exports.createShop = [
    upload.single('logo'),
    async (req, res) => {
        try {
            const { name, address, phone, shopTypeCode } = req.body;
            const file = req.file;
            const adminId = req.admin.id;

            if (!shopTypeCode) {
                return res.status(400).json({ message: 'shopTypeCode is required' });
            }

            const shopType = await prisma.shopType.findUnique({ where: { code: shopTypeCode } });
            if (!shopType || !shopType.isActive) {
                return res.status(400).json({ message: 'Invalid shopTypeCode' });
            }

            let logoUrl = req.body.logo;
            if (file && file.buffer) {
                const filename = `${Date.now()}_${file.originalname}`;
                logoUrl = await bucketStorage.uploadImageFromBuffer(file.buffer, file.mimetype, filename);
            }

            const shop = await prisma.$transaction(async (tx) => {
                const created = await tx.shop.create({
                    data: { name, address, phone, logo: logoUrl, adminId, shopTypeId: shopType.id },
                });
                await seedDefaultCategoriesForShop(tx, created.id, shopType);
                return created;
            });

            res.status(201).json({ message: 'Shop created successfully', shop, id: shop.id });
        } catch (err) {
            console.error('Create Shop Error:', err);
            res.status(500).json({ error: err.message });
        }
    },
];

// Get all shops for the logged-in admin
exports.getShops = async (req, res) => {
    try {
        const adminId = req.admin.id;
        const shops = await prisma.shop.findMany({
            where: { adminId },
            include: {
                shopType: true,
                _count: { select: { products: true, bills: true } },
            },
        });

        res.json(shops);
    } catch (err) {
        console.error('Get Shops Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Get a single shop by ID
exports.getShopById = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.admin.id;

        const shop = await prisma.shop.findFirst({
            where: { id: parseInt(id), adminId },
            include: {
                shopType: true,
                _count: { select: { products: true, bills: true } },
            },
        });

        if (!shop) return res.status(404).json({ message: 'Shop not found' });

        res.json(shop);
    } catch (err) {
        console.error('Get Shop Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Update a shop
exports.updateShop = [
    upload.single('logo'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { name, address, phone } = req.body;
            const file = req.file;
            const adminId = req.admin.id;

            const existingShop = await prisma.shop.findFirst({ where: { id: parseInt(id), adminId } });
            if (!existingShop) return res.status(404).json({ message: 'Shop not found or unauthorized' });

            let logoUrl = req.body.logo || existingShop.logo;
            if (file && file.buffer) {
                const filename = `${Date.now()}_${file.originalname}`;
                logoUrl = await bucketStorage.uploadImageFromBuffer(file.buffer, file.mimetype, filename);
            }

            const shop = await prisma.shop.update({
                where: { id: parseInt(id) },
                data: { name, address, phone, logo: logoUrl },
            });

            res.json({ message: 'Shop updated successfully', shop });
        } catch (err) {
            console.error('Update Shop Error:', err);
            res.status(500).json({ error: err.message });
        }
    },
];

// Delete a shop
exports.deleteShop = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.admin.id;

        const shop = await prisma.shop.findFirst({ where: { id: parseInt(id), adminId } });
        if (!shop) return res.status(404).json({ message: 'Shop not found or unauthorized' });

        await prisma.shop.delete({ where: { id: parseInt(id) } });

        res.json({ message: 'Shop deleted successfully' });
    } catch (err) {
        console.error('Delete Shop Error:', err);
        res.status(500).json({ error: err.message });
    }
};
