require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');
const { activateFreeTrial } = require('../services/subscriptionService');
const { seedDefaultCategoriesForShop } = require('../services/shopTypeService');

// -------------------
// ADMIN AUTH (shop owner / tenant)
// -------------------
const generateAdminAccessToken = (admin) =>
    jwt.sign({ adminId: admin.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '15d' });

const generateAdminRefreshToken = (admin) =>
    jwt.sign({ adminId: admin.id, role: 'admin' }, process.env.REFRESH_SECRET, { expiresIn: '180d' });

// Unified registration: one call creates the Admin (owner) + their first Shop
// (with its chosen ShopType and any suggested starter categories) + activates
// the free trial, all in a single transaction. Onboarding-wizard friendly —
// the client collects email/password/phone + shop details + shop type in one
// flow and posts it all here.
exports.register = async (req, res) => {
    const { name, email, password, phone, shopName, shopAddress, shopPhone, shopTypeCode } = req.body;

    if (!name || !email || !password || !shopName || !shopTypeCode) {
        return res.status(400).json({ message: 'name, email, password, shopName and shopTypeCode are required' });
    }

    try {
        const existingAdmin = await prisma.admin.findUnique({ where: { email } });
        if (existingAdmin) return res.status(400).json({ message: 'An account with this email already exists' });

        const shopType = await prisma.shopType.findUnique({ where: { code: shopTypeCode } });
        if (!shopType || !shopType.isActive) {
            return res.status(400).json({ message: 'Invalid shopTypeCode' });
        }

        const hashed = await bcrypt.hash(password, 10);

        const { admin, shop } = await prisma.$transaction(async (tx) => {
            const admin = await tx.admin.create({
                // adCoins: 10 mirrors the Admin.adCoins schema default — set
                // explicitly here so the starter grant is obvious at the call
                // site rather than relying only on the column default.
                data: { name, email, password: hashed, phone: phone || null, adCoins: 10 },
            });

            const shop = await tx.shop.create({
                data: {
                    adminId: admin.id,
                    shopTypeId: shopType.id,
                    name: shopName,
                    address: shopAddress || null,
                    phone: shopPhone || null,
                },
            });

            await seedDefaultCategoriesForShop(tx, shop.id, shopType);
            await activateFreeTrial(tx, admin.id);

            return { admin, shop };
        });

        const accessToken = generateAdminAccessToken(admin);
        const refreshToken = generateAdminRefreshToken(admin);
        await prisma.admin.update({ where: { id: admin.id }, data: { refreshToken } });

        res.status(201).json({
            message: 'Account created successfully',
            accessToken,
            refreshToken,
            adminId: admin.id,
            email: admin.email,
            name: admin.name,
            shop,
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

// Admin Login
exports.adminLogin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const admin = await prisma.admin.findUnique({
            where: { email },
            include: { shops: { include: { shopType: true } } },
        });

        if (!admin || !(await bcrypt.compare(password, admin.password))) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        if (!admin.isActive) {
            return res.status(403).json({ message: 'This account has been suspended' });
        }

        const accessToken = generateAdminAccessToken(admin);
        const refreshToken = generateAdminRefreshToken(admin);

        await prisma.admin.update({ where: { id: admin.id }, data: { refreshToken } });

        const { getActiveEntitlement } = require('../services/subscriptionService');
        const entitlement = await getActiveEntitlement(admin.id);

        res.json({
            accessToken,
            refreshToken,
            adminId: admin.id,
            email: admin.email,
            name: admin.name,
            shops: admin.shops,
            entitlement,
        });
    } catch (err) {
        console.error('Admin login error:', err.message);
        res.status(500).json({ message: 'Server error' });
    }
};

// Admin Refresh Token
exports.adminRefresh = async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: 'No token provided' });

    try {
        const payload = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
        const admin = await prisma.admin.findUnique({ where: { id: payload.adminId } });

        if (!admin || admin.refreshToken !== refreshToken) {
            return res.status(403).json({ message: 'Invalid token' });
        }

        const newAccessToken = generateAdminAccessToken(admin);
        res.json({ accessToken: newAccessToken, refreshToken });
    } catch (err) {
        return res.status(403).json({ message: 'Token expired or invalid' });
    }
};

// Update Admin Password
exports.updateAdminPassword = async (req, res) => {
    const { previousPassword, newPassword } = req.body;
    const adminId = req.admin.id;

    if (!previousPassword || !newPassword) {
        return res.status(400).json({ message: 'Previous and new password are required' });
    }

    try {
        const admin = await prisma.admin.findUnique({ where: { id: adminId } });
        if (!admin) return res.status(404).json({ message: 'Admin not found' });

        const isMatch = await bcrypt.compare(previousPassword, admin.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect previous password' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        await prisma.admin.update({ where: { id: adminId }, data: { password: hashedNewPassword } });

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error('Update admin password error:', err.message);
        res.status(500).json({ message: 'Server error during admin password update' });
    }
};
