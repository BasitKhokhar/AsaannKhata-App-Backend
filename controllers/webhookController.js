const { handleWebhookEvent } = require('../services/revenueCatService');
const { timingSafeEqual } = require('crypto');

// POST /webhooks/revenuecat — verified via a shared-secret header (configured
// in the RevenueCat dashboard), not JWT, since RevenueCat's servers call this.
exports.revenueCatWebhook = async (req, res) => {
    const providedSecret = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    const expectedSecret = process.env.REVENUECAT_WEBHOOK_SECRET || '';
    const provided = Buffer.from(providedSecret);
    const expected = Buffer.from(expectedSecret);

    if (!expectedSecret || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        return res.status(401).json({ message: 'Invalid webhook secret' });
    }

    const event = req.body?.event;
    if (!event || !event.id || !event.type) {
        return res.status(400).json({ message: 'Malformed webhook payload' });
    }
    const allowedAppIds = (process.env.REVENUECAT_APP_IDS || process.env.REVENUECAT_APP_ID || '')
        .split(',').map((id) => id.trim()).filter(Boolean);
    if (allowedAppIds.length && !allowedAppIds.includes(event.app_id)) {
        return res.status(400).json({ message: 'Unexpected RevenueCat app' });
    }

    try {
        const result = await handleWebhookEvent(event);
        res.status(200).json(result);
    } catch (err) {
        console.error('RevenueCat webhook error:', err);
        // Let RevenueCat retry transient processing failures. Keep details
        // out of the response; the server log retains the diagnostic error.
        res.status(500).json({ ok: false, error: 'Webhook processing failed' });
    }
};
