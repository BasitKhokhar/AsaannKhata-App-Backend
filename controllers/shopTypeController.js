const prisma = require('../prisma/client');

// GET /shop-types — public, used by the registration screen's shop-type picker.
exports.getActiveShopTypes = async (req, res) => {
    try {
        const shopTypes = await prisma.shopType.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
        });
        res.json({ shopTypes });
    } catch (err) {
        console.error('Get Active Shop Types Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// -------- Superadmin CRUD --------

exports.getAllShopTypes = async (req, res) => {
    try {
        const shopTypes = await prisma.shopType.findMany({ orderBy: { sortOrder: 'asc' } });
        res.json({ shopTypes });
    } catch (err) {
        console.error('Get All Shop Types Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.createShopType = async (req, res) => {
    try {
        const shopType = await prisma.shopType.create({ data: req.body });
        res.status(201).json({ message: 'Shop type created', shopType });
    } catch (err) {
        if (err.code === 'P2002') return res.status(400).json({ message: 'Shop type code already exists' });
        console.error('Create Shop Type Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateShopType = async (req, res) => {
    try {
        const { id } = req.params;
        const numericId = Number.parseInt(id, 10);
        const { code, label, labelUrdu, description, defaultStockType, suggestedCategories, sortOrder, isActive } = req.body;
        if (!Number.isSafeInteger(numericId) || numericId < 1) return res.status(400).json({ message: 'Invalid shop type id' });
        if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ message: 'A label is required' });
        if (typeof code !== 'string' || !/^[A-Z0-9_]+$/.test(code.trim())) return res.status(400).json({ message: 'Code must use uppercase letters, numbers and underscores' });
        if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'isActive must be a boolean' });
        const data = { code: code.trim(), label: label.trim(), labelUrdu: labelUrdu ? String(labelUrdu).trim() : null,
            description: description ? String(description).trim() : null, defaultStockType, suggestedCategories,
            sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0, isActive };
        const shopType = await prisma.shopType.update({ where: { id: numericId }, data });
        res.json({ message: 'Shop type updated', shopType });
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ message: 'Shop type not found' });
        if (err.code === 'P2002') return res.status(400).json({ message: 'Shop type code already exists' });
        console.error('Update Shop Type Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Never hard-deleted (Shop.shopTypeId references it) — only deactivated so it
// drops out of the registration picker.
exports.deactivateShopType = async (req, res) => {
    try {
        const { id } = req.params;
        const shopType = await prisma.shopType.update({ where: { id: parseInt(id) }, data: { isActive: false } });
        res.json({ message: 'Shop type deactivated', shopType });
    } catch (err) {
        console.error('Deactivate Shop Type Error:', err);
        res.status(500).json({ error: err.message });
    }
};
