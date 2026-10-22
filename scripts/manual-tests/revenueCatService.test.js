const test = require('node:test');
const assert = require('node:assert/strict');
const { selectActivePurchase } = require('../../services/revenueCatService');

const plans = [
    { id: 1, code: 'LIFETIME', revenueCatProductId: 'lifetime', isLifetime: true, isActive: true },
    { id: 2, code: 'MONTHLY', revenueCatProductId: 'monthly', isLifetime: false, isActive: true },
];

test('active subscription beats older lifetime purchase', () => {
    const subscriber = {
        entitlements: {
            lifetime: { product_identifier: 'lifetime', purchase_date: '2025-01-01T00:00:00Z', expires_date: null },
            monthly: { product_identifier: 'monthly', purchase_date: '2026-01-01T00:00:00Z', expires_date: '2027-01-01T00:00:00Z' },
        },
        subscriptions: { monthly: { store: 'play_store', store_transaction_id: 'GPA.123', refunded_at: null, purchase_date: '2026-01-01T00:00:00Z', expires_date: '2027-01-01T00:00:00Z' } },
    };
    assert.equal(selectActivePurchase(subscriber, plans, Date.parse('2026-06-01')).productId, 'monthly');
    assert.equal(selectActivePurchase(subscriber, plans, Date.parse('2028-01-01')).productId, 'lifetime');
});

test('grace period retains access only until grace expiry', () => {
    const subscriber = {
        entitlements: {
            monthly: {
                product_identifier: 'monthly', purchase_date: '2026-01-01T00:00:00Z',
                expires_date: '2026-02-01T00:00:00Z', grace_period_expires_date: '2026-02-08T00:00:00Z',
            },
        },
        subscriptions: { monthly: { refunded_at: null, purchase_date: '2026-01-01T00:00:00Z', expires_date: '2026-02-01T00:00:00Z', grace_period_expires_date: '2026-02-08T00:00:00Z' } },
    };
    assert.equal(selectActivePurchase(subscriber, plans, Date.parse('2026-02-05')).status, 'GRACE_PERIOD');
    assert.equal(selectActivePurchase(subscriber, plans, Date.parse('2026-02-09')), null);
});

test('refunded and unknown products do not grant access', () => {
    const base = { product_identifier: 'monthly', purchase_date: '2026-01-01T00:00:00Z', expires_date: '2027-01-01T00:00:00Z' };
    assert.equal(selectActivePurchase({ subscriptions: { monthly: { ...base, refunded_at: '2026-02-01' } } }, plans), null);
    assert.equal(selectActivePurchase({ entitlements: { unknown: { ...base, product_identifier: 'unknown' } } }, plans), null);
});
