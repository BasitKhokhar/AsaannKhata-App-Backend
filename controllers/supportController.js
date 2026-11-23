const prisma = require('../prisma/client');

const CATEGORIES = new Set(['app_bug', 'general_question', 'billing', 'account', 'feature_request', 'privacy', 'delete_account', 'other']);

exports.create = async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const category = String(req.body.category || '').trim();
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'A valid email is required' });
    if (!CATEGORIES.has(category)) return res.status(400).json({ message: 'Select a valid support category' });
    if (!subject || subject.length > 160) return res.status(400).json({ message: 'Subject is required and must be 160 characters or fewer' });
    if (message.length < 10 || message.length > 5000) return res.status(400).json({ message: 'Message must be between 10 and 5000 characters' });

    try {
        const request = await prisma.supportRequest.create({
            data: { adminId: req.tenant.adminId, shopId: req.tenant.shopId || null, email, category, subject, message },
            select: { id: true, category: true, subject: true, status: true, createdAt: true },
        });
        console.log('[support] request created', { id: request.id, adminId: req.tenant.adminId, shopId: req.tenant.shopId, category });
        return res.status(201).json({ success: true, request });
    } catch (error) {
        console.error('Create support request error:', error);
        return res.status(500).json({ success: false, message: 'Unable to submit support request' });
    }
};

exports.updateStatus = async (req, res) => {
    const id = Number(req.params.id);
    const status = String(req.body.status || '').trim().toUpperCase();
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid support request id' });
    if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) return res.status(400).json({ message: 'Invalid support request status' });
    try {
        const request = await prisma.supportRequest.update({ where: { id }, data: { status } });
        return res.json({ success: true, request });
    } catch (error) {
        return res.status(error.code === 'P2025' ? 404 : 500).json({ message: error.code === 'P2025' ? 'Support request not found' : 'Unable to update support request' });
    }
};

