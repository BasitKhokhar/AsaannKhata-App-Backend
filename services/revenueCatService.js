const axios = require('axios');
const prisma = require('../prisma/client');

const LIVE_STATUSES = ['ACTIVE', 'GRACE_PERIOD'];
const PURCHASE_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'REFUND_REVERSED']);
const LIFECYCLE_EVENTS = new Set([
    ...PURCHASE_EVENTS,
    'CANCELLATION', 'UNCANCELLATION', 'EXPIRATION', 'BILLING_ISSUE',
    'SUBSCRIPTION_PAUSED', 'SUBSCRIPTION_EXTENDED', 'PRODUCT_CHANGE',
]);

function resolveAdminId(value) {
    const id = String(value ?? '');
    if (!/^[1-9]\d*$/.test(id)) return null;
    const parsed = Number(id);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

// RevenueCat's current entitlement snapshot is authoritative. Webhook type
// alone is not: PRODUCT_CHANGE can be deferred, CANCELLATION can retain access,
// and webhook deliveries can arrive out of order.
function selectActivePurchase(subscriber, plans, now = Date.now()) {
    const planByProduct = new Map(plans.filter((p) => p.revenueCatProductId).map((p) => [p.revenueCatProductId, p]));
    const candidates = [];

    for (const [productId, subscription] of Object.entries(subscriber?.subscriptions || {})) {
        const plan = planByProduct.get(productId);
        if (!plan || plan.isActive === false) continue;
        const purchaseDate = parseDate(subscription.purchase_date);
        const expiry = parseDate(subscription.expires_date);
        const graceExpiry = parseDate(subscription.grace_period_expires_date);
        const effectiveExpiry = graceExpiry && (!expiry || graceExpiry > expiry) ? graceExpiry : expiry;
        if (subscription?.refunded_at) continue;
        if (effectiveExpiry && effectiveExpiry.getTime() <= now) continue;
        if (!effectiveExpiry && !plan.isLifetime) continue;

        const status = graceExpiry && graceExpiry.getTime() > now && (!expiry || expiry.getTime() <= now)
            ? 'GRACE_PERIOD' : 'ACTIVE';
        candidates.push({
            plan, productId, status, expiryDate: effectiveExpiry,
            purchasedAt: purchaseDate?.getTime() || 0,
            store: subscription?.store?.toUpperCase() || null,
            transactionId: subscription?.store_transaction_id ? String(subscription.store_transaction_id) : null,
            cancelledAt: parseDate(subscription?.unsubscribe_detected_at),
        });
    }

    // Non-consumable lifetime purchases have no subscription expiry. RevenueCat
    // removes refunded products from its active entitlements snapshot.
    for (const entitlement of Object.values(subscriber?.entitlements || {})) {
        const productId = entitlement.product_identifier;
        const plan = planByProduct.get(productId);
        if (!plan?.isLifetime || plan.isActive === false || parseDate(entitlement.expires_date)) continue;
        const latestPurchase = (subscriber?.non_subscriptions?.[productId] || [])
            .sort((a, b) => (parseDate(b.purchase_date)?.getTime() || 0) - (parseDate(a.purchase_date)?.getTime() || 0))[0];
        candidates.push({
            plan, productId, status: 'ACTIVE', expiryDate: null,
            purchasedAt: parseDate(entitlement.purchase_date)?.getTime() || 0,
            store: latestPurchase?.store?.toUpperCase() || null,
            transactionId: latestPurchase?.id || null,
            cancelledAt: null,
        });
    }

    // The newest active purchase wins; a lifetime entitlement is still
    // available on a later reconciliation if a newer subscription expires.
    return candidates.sort((a, b) => b.purchasedAt - a.purchasedAt)[0] || null;
}

async function verifySubscriberFromApi(adminId) {
    if (!process.env.REVENUECAT_API_KEY) throw new Error('REVENUECAT_API_KEY is not configured');
    const { data } = await axios.get(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(adminId)}`, {
        headers: { Authorization: `Bearer ${process.env.REVENUECAT_API_KEY}` },
        timeout: 10000,
    });
    if (!data?.subscriber) throw new Error('RevenueCat returned no subscriber');
    return data;
}

async function reconcileFromSubscriber(adminId, event = null) {
    const id = resolveAdminId(adminId);
    if (!id) throw new Error('Invalid admin ID for RevenueCat reconciliation');
    const [data, plans] = await Promise.all([
        verifySubscriberFromApi(id),
        prisma.subscriptionPlan.findMany({ where: { revenueCatProductId: { not: null } } }),
    ]);
    const selected = selectActivePurchase(data.subscriber, plans);

    try {
        return await prisma.$transaction(async (tx) => {
            if (event?.id) {
                const prior = await tx.subscriptionPayment.findUnique({ where: { revenueCatEventId: event.id } });
                if (prior) return { ok: true, deduped: true };
            }

            let subscription = null;
            if (selected) {
                subscription = await tx.userSubscription.findFirst({
                    where: { adminId: id, paymentProvider: 'REVENUECAT', productId: selected.productId },
                    orderBy: { createdAt: 'desc' },
                });
            }

            await tx.userSubscription.updateMany({
                where: {
                    adminId: id,
                    status: { in: LIVE_STATUSES },
                    ...(selected ? {} : { paymentProvider: 'REVENUECAT' }),
                    ...(subscription ? { id: { not: subscription.id } } : {}),
                },
                data: { status: 'EXPIRED' },
            });

            if (selected) {
                const fields = {
                    planId: selected.plan.id,
                    status: selected.status,
                    expiryDate: selected.expiryDate,
                    cancelledAt: selected.cancelledAt,
                    billingCycle: selected.plan.billingCycle,
                    productId: selected.productId,
                    store: selected.store || event?.store || null,
                    revenueCatAppUserId: String(id),
                    originalTransactionId: subscription?.originalTransactionId || event?.original_transaction_id || selected.transactionId,
                    cloudEnabled: selected.plan.cloudEnabled,
                    offlineEnabled: selected.plan.offlineEnabled,
                    maxDevices: selected.plan.maxDevices,
                    isTrial: false,
                };
                subscription = subscription
                    ? await tx.userSubscription.update({ where: { id: subscription.id }, data: fields })
                    : await tx.userSubscription.create({ data: { adminId: id, paymentProvider: 'REVENUECAT', ...fields } });
            }

            if (event?.id) {
                // Non-purchase events are audit records, never paid invoices.
                const ledgerTarget = subscription || await tx.userSubscription.findFirst({
                    where: { adminId: id, paymentProvider: 'REVENUECAT' }, orderBy: { createdAt: 'desc' },
                });
                if (ledgerTarget) {
                    await tx.subscriptionPayment.create({
                        data: {
                            subscriptionId: ledgerTarget.id,
                            amount: PURCHASE_EVENTS.has(event.type) && typeof event.price_in_purchased_currency === 'number'
                                ? event.price_in_purchased_currency : 0,
                            currency: event.currency || selected?.plan.currency || 'PKR',
                            paymentProvider: 'REVENUECAT',
                            paymentStatus: PURCHASE_EVENTS.has(event.type) ? 'PAID'
                                : event.type === 'BILLING_ISSUE' ? 'FAILED'
                                    : event.type === 'CANCELLATION' && event.cancel_reason === 'CUSTOMER_SUPPORT' ? 'REFUNDED' : 'PENDING',
                            transactionId: event.transaction_id || null,
                            revenueCatEventId: event.id,
                            eventType: event.type,
                            rawPayload: event,
                            paidAt: PURCHASE_EVENTS.has(event.type) ? new Date() : null,
                        },
                    });
                }
            }
            return { ok: true, reconciled: true, subscriptionId: subscription?.id || null };
        });
    } catch (err) {
        if (err.code === 'P2002' && String(err.meta?.target).includes('revenueCatEventId')) {
            return { ok: true, deduped: true };
        }
        throw err;
    }
}

async function handleWebhookEvent(event) {
    if (event.type === 'TEST') return { ok: true, skipped: true, reason: 'TEST_EVENT' };
    if (event.type === 'TRANSFER') {
        const ids = [...new Set([...(event.transferred_from || []), ...(event.transferred_to || [])]
            .map(resolveAdminId).filter(Boolean))];
        await Promise.all(ids.map((id) => reconcileFromSubscriber(id)));
        return { ok: true, reconciled: ids.length };
    }
    if (!LIFECYCLE_EVENTS.has(event.type)) return { ok: true, skipped: true, reason: 'UNSUPPORTED_EVENT' };
    const adminId = resolveAdminId(event.app_user_id);
    if (!adminId) return { ok: true, skipped: true, reason: 'UNMAPPED_APP_USER_ID' };
    const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { id: true } });
    if (!admin) return { ok: true, skipped: true, reason: 'ADMIN_NOT_FOUND' };
    if (event.product_id) {
        const plan = await prisma.subscriptionPlan.findUnique({ where: { revenueCatProductId: event.product_id } });
        if (!plan) throw new Error(`No SubscriptionPlan maps RevenueCat product ${event.product_id}`);
    }
    return reconcileFromSubscriber(adminId, event);
}

module.exports = { handleWebhookEvent, verifySubscriberFromApi, reconcileFromSubscriber, selectActivePurchase };
