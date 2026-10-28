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

test('Google Play base plans select distinct monthly, six month, and yearly catalog rows', () => {
    const basePlans = [
        { id: 3, code: 'MONTHLY', revenueCatProductId: 'cloud:monthly', isLifetime: false, isActive: true },
        { id: 4, code: 'SIX_MONTH', revenueCatProductId: 'cloud:semiannual', isLifetime: false, isActive: true },
        { id: 5, code: 'YEARLY', revenueCatProductId: 'cloud:yearly', isLifetime: false, isActive: true },
    ];
    for (const [basePlan, code] of [['monthly', 'MONTHLY'], ['semiannual', 'SIX_MONTH'], ['yearly', 'YEARLY']]) {
        const subscriber = { subscriptions: { cloud: {
            product_plan_identifier: basePlan, purchase_date: '2026-01-01T00:00:00Z',
            expires_date: '2027-01-01T00:00:00Z',
        } } };
        const selected = selectActivePurchase(subscriber, basePlans, Date.parse('2026-06-01'));
        assert.equal(selected.plan.code, code);
        assert.equal(selected.productId, `cloud:${basePlan}`);
    }
});
