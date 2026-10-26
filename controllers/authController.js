require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const prisma = require('../prisma/client');
const { activateFreeTrial } = require('../services/subscriptionService');
const { seedDefaultCategoriesForShop } = require('../services/shopTypeService');
const { sendPasswordResetCode } = require('../services/mailService');

const validEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = (value) => typeof value === 'string' && value.length >= 12 && value.length <= 128;
const resetHash = (adminId, code) => crypto.createHmac('sha256', process.env.REFRESH_SECRET).update(`${adminId}:${code}`).digest('hex');

// -------------------
// ADMIN AUTH (shop owner / tenant)
// -------------------
const generateAdminAccessToken = (admin) =>
    jwt.sign({ adminId: admin.id, role: 'admin', tokenVersion: admin.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '15m' });

const generateAdminRefreshToken = (admin) =>
    jwt.sign({ adminId: admin.id, role: 'admin', tokenVersion: admin.tokenVersion }, process.env.REFRESH_SECRET, { expiresIn: '30d', jwtid: crypto.randomUUID() });

// Unified registration: one call creates the Admin (owner) + their first Shop
// (with its chosen ShopType and any suggested starter categories) + activates
// the free trial, all in a single transaction. Onboarding-wizard friendly —
// the client collects email/password/phone + shop details + shop type in one
// flow and posts it all here.
exports.register = async (req, res) => {
    const { name, password, phone, shopName, shopAddress, shopPhone, shopTypeCode } = req.body || {};
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!name || !email || !password || !shopName || !shopTypeCode) {
        return res.status(400).json({ message: 'name, email, password, shopName and shopTypeCode are required' });
    }
    if (!validEmail(email) || !validPassword(password)) return res.status(400).json({ message: 'Valid email and password of 12–128 characters are required' });

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
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!validEmail(email) || typeof password !== 'string') return res.status(400).json({ message: 'Invalid credentials' });
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
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(401).json({ message: 'No token provided' });

    try {
        const payload = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
        if (payload.role !== 'admin') return res.status(403).json({ message: 'Invalid token' });
        const admin = await prisma.admin.findUnique({ where: { id: payload.adminId } });

        if (!admin || !admin.isActive || admin.tokenVersion !== payload.tokenVersion || admin.refreshToken !== refreshToken) {
            return res.status(403).json({ message: 'Invalid token' });
        }

        const nextRefreshToken = generateAdminRefreshToken(admin);
        const rotated = await prisma.admin.updateMany({ where: { id: admin.id, refreshToken }, data: { refreshToken: nextRefreshToken } });
        if (!rotated.count) return res.status(403).json({ message: 'Invalid token' });
        res.json({ accessToken: generateAdminAccessToken(admin), refreshToken: nextRefreshToken });
    } catch (err) {
        return res.status(403).json({ message: 'Token expired or invalid' });
    }
};

// Update Admin Password
exports.updateAdminPassword = async (req, res) => {
    const { newPassword } = req.body || {};
    const previousPassword = req.body?.previousPassword || req.body?.currentPassword;
    const adminId = req.admin.id;

    if (!previousPassword || !newPassword) {
        return res.status(400).json({ message: 'Previous and new password are required' });
    }
    if (!validPassword(newPassword)) return res.status(400).json({ message: 'New password must be 12–128 characters' });

    try {
        const admin = await prisma.admin.findUnique({ where: { id: adminId } });
        if (!admin) return res.status(404).json({ message: 'Admin not found' });

        const isMatch = await bcrypt.compare(previousPassword, admin.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect previous password' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        await prisma.admin.update({ where: { id: adminId }, data: { password: hashedNewPassword, refreshToken: null, tokenVersion: { increment: 1 } } });

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error('Update admin password error:', err.message);
        res.status(500).json({ message: 'Server error during admin password update' });
    }
};

exports.requestPasswordReset = async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!validEmail(email)) return res.status(400).json({ message: 'Valid email is required' });
    const response = { message: 'If this email has an account, a reset code will be sent.' };
    try {
        const admin = await prisma.admin.findUnique({ where: { email } });
        if (!admin || !admin.isActive) return res.status(202).json(response);
        const now = new Date();
        const existing = await prisma.passwordReset.findUnique({ where: { adminId: admin.id } });
        if (existing && now.getTime() - existing.requestedAt.getTime() < 60000) return res.status(202).json(response);
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const codeHash = resetHash(admin.id, code);
        await prisma.passwordReset.upsert({ where: { adminId: admin.id }, create: { adminId: admin.id, codeHash, expiresAt: new Date(now.getTime() + 600000), requestedAt: now }, update: { codeHash, expiresAt: new Date(now.getTime() + 600000), requestedAt: now, attempts: 0 } });
        try {
            await sendPasswordResetCode(admin.email, code);
        } catch (mailError) {
            await prisma.passwordReset.deleteMany({ where: { adminId: admin.id, codeHash } });
            console.error('Password reset email delivery failed:', mailError.message);
        }
        return res.status(202).json(response);
    } catch (err) {
        console.error('Password reset request failed:', err);
        return res.status(500).json({ message: 'Unable to process reset request' });
    }
};

exports.resetPassword = async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const { code, newPassword } = req.body || {};
    if (!validEmail(email) || typeof code !== 'string' || !/^\d{6}$/.test(code) || !validPassword(newPassword)) {
        return res.status(400).json({ message: 'Valid email, 6-digit code and password of 12–128 characters are required' });
    }
    try {
        const admin = await prisma.admin.findUnique({ where: { email } });
        if (!admin || !admin.isActive) return res.status(400).json({ message: 'Invalid or expired code' });
        const codeHash = resetHash(admin.id, code);
        const reset = await prisma.passwordReset.findUnique({ where: { adminId: admin.id } });
        if (!reset || reset.expiresAt <= new Date() || reset.attempts >= 5) return res.status(400).json({ message: 'Invalid or expired code' });
        if (reset.codeHash !== codeHash) {
            await prisma.passwordReset.updateMany({ where: { adminId: admin.id, codeHash: reset.codeHash, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
            return res.status(400).json({ message: 'Invalid or expired code' });
        }
        const hashed = await bcrypt.hash(newPassword, 12);
        const changed = await prisma.$transaction(async (tx) => {
            const consumed = await tx.passwordReset.deleteMany({ where: { adminId: admin.id, codeHash, expiresAt: { gt: new Date() }, attempts: { lt: 5 } } });
            if (!consumed.count) return false;
            await tx.admin.update({ where: { id: admin.id }, data: { password: hashed, refreshToken: null, tokenVersion: { increment: 1 } } });
            return true;
        });
        if (!changed) return res.status(400).json({ message: 'Invalid or expired code' });
        return res.json({ message: 'Password reset. Sign in with your new password.' });
    } catch (err) {
        console.error('Password reset failed:', err);
        return res.status(500).json({ message: 'Unable to reset password' });
    }
};
