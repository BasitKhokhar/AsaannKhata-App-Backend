const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');

// -------------------
// SUPERADMIN AUTH
// -------------------
const generateSuperAdminAccessToken = (superAdmin) =>
    jwt.sign({ superAdminId: superAdmin.id, role: 'superadmin' }, process.env.JWT_SECRET, { expiresIn: '1d' });

const generateSuperAdminRefreshToken = (superAdmin) =>
    jwt.sign({ superAdminId: superAdmin.id, role: 'superadmin' }, process.env.REFRESH_SECRET, { expiresIn: '30d' });

exports.superAdminLogin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const superAdmin = await prisma.superAdmin.findUnique({ where: { email } });
        if (!superAdmin || !(await bcrypt.compare(password, superAdmin.password))) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const accessToken = generateSuperAdminAccessToken(superAdmin);
        const refreshToken = generateSuperAdminRefreshToken(superAdmin);

        await prisma.superAdmin.update({ where: { id: superAdmin.id }, data: { refreshToken } });

        res.json({ accessToken, refreshToken, superAdminId: superAdmin.id, email: superAdmin.email, name: superAdmin.name });
    } catch (err) {
        console.error('SuperAdmin login error:', err.message);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.superAdminRefresh = async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: 'No token provided' });

    try {
        const payload = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
        const superAdmin = await prisma.superAdmin.findUnique({ where: { id: payload.superAdminId } });

        if (!superAdmin || superAdmin.refreshToken !== refreshToken) {
            return res.status(403).json({ message: 'Invalid token' });
        }

        res.json({ accessToken: generateSuperAdminAccessToken(superAdmin), refreshToken });
    } catch (err) {
        return res.status(403).json({ message: 'Token expired or invalid' });
    }
};

exports.updateSuperAdminPassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
        return res.status(400).json({ message: 'Current password and a new password of 12–128 characters are required' });
    }
    try {
        const account = await prisma.superAdmin.findUnique({ where: { id: req.superAdmin.id } });
        if (!account || !(await bcrypt.compare(currentPassword, account.password))) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }
        const hashed = await bcrypt.hash(newPassword, 12);
        await prisma.superAdmin.update({ where: { id: account.id }, data: { password: hashed, refreshToken: null } });
        res.json({ message: 'Password updated. Sign in again on your other sessions.' });
    } catch (err) {
        console.error('Superadmin password update error:', err);
        res.status(500).json({ message: 'Unable to update password' });
    }
};

// -------------------
// PLAN CRUD
// -------------------
exports.createPlan = async (req, res) => {
    try {
        const plan = await prisma.subscriptionPlan.create({ data: req.body });
        res.status(201).json({ message: 'Plan created', plan });
    } catch (err) {
        if (err.code === 'P2002') return res.status(400).json({ message: 'Plan code already exists' });
        console.error('Create Plan Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.getAllPlans = async (req, res) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } });
        res.json({ plans });
    } catch (err) {
        console.error('Get All Plans Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const plan = await prisma.subscriptionPlan.update({ where: { id: parseInt(id) }, data: req.body });
        res.json({ message: 'Plan updated', plan });
    } catch (err) {
        console.error('Update Plan Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Plans with live subscriptions are never hard-deleted — only deactivated,
// so historical UserSubscription/SubscriptionPayment rows keep a valid FK.
exports.deactivatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const plan = await prisma.subscriptionPlan.update({
            where: { id: parseInt(id) },
            data: { isActive: false },
        });
        res.json({ message: 'Plan deactivated', plan });
    } catch (err) {
        console.error('Deactivate Plan Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// -------------------
// MANUAL SUBSCRIPTION ASSIGNMENT (bank transfer sales, goodwill extensions)
// -------------------
exports.assignSubscription = async (req, res) => {
    try {
        const { adminId, planCode, expiryDate } = req.body;

        const plan = await prisma.subscriptionPlan.findUnique({ where: { code: planCode } });
        if (!plan) return res.status(404).json({ message: 'Plan not found' });

        const admin = await prisma.admin.findUnique({ where: { id: parseInt(adminId) } });
        if (!admin) return res.status(404).json({ message: 'Admin not found' });

        const result = await prisma.$transaction(async (tx) => {
            await tx.userSubscription.updateMany({
                where: { adminId: admin.id, status: { in: ['ACTIVE', 'GRACE_PERIOD'] } },
                data: { status: 'EXPIRED' },
            });

            return tx.userSubscription.create({
                data: {
                    adminId: admin.id,
                    planId: plan.id,
                    status: 'ACTIVE',
                    isTrial: plan.isTrialPlan,
                    paymentProvider: 'MANUAL',
                    expiryDate: expiryDate ? new Date(expiryDate) : (plan.durationDays ? new Date(Date.now() + plan.durationDays * 86400000) : null),
                    cloudEnabled: plan.cloudEnabled,
                    offlineEnabled: plan.offlineEnabled,
                    maxDevices: plan.maxDevices,
                    assignedBySuperAdminId: req.superAdmin.id,
                },
            });
        });

        res.status(201).json({ message: 'Subscription assigned', subscription: result });
    } catch (err) {
        console.error('Assign Subscription Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// -------------------
// ADMIN MANAGEMENT
// -------------------
exports.getAllAdmins = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const admins = await prisma.admin.findMany({
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true, name: true, email: true, phone: true, isActive: true,
                createdAt: true,
                shops: { select: { id: true, name: true, shopType: { select: { code: true, label: true } } } },
                subscriptions: {
                    where: { status: { in: ['ACTIVE', 'GRACE_PERIOD'] } },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: { plan: true },
                },
            },
        });

        const total = await prisma.admin.count();
        res.json({ admins, total, page, limit, hasMore: skip + limit < total });
    } catch (err) {
        console.error('Get All Admins Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.setAdminStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || typeof isActive !== 'boolean') {
            return res.status(400).json({ message: 'Valid owner ID and boolean isActive are required' });
        }
        const admin = await prisma.admin.update({ where: { id: parseInt(id) }, data: { isActive: !!isActive } });
        res.json({ message: 'Admin status updated', admin });
    } catch (err) {
        console.error('Set Admin Status Error:', err);
        res.status(500).json({ error: err.message });
    }
};
