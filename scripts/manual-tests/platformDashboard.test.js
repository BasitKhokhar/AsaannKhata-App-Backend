const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../../controllers/platformDashboardController');

test('pagination is bounded and never starts before page one', () => {
    assert.deepEqual(_test.pageOptions({ page: '-5', limit: '1000' }), { page: 1, limit: 100, skip: 0 });
    assert.deepEqual(_test.pageOptions({ page: '3', limit: '25' }), { page: 3, limit: 25, skip: 50 });
});

test('platform IDs must be positive safe integers', () => {
    assert.equal(_test.validId('17'), 17);
    assert.equal(_test.validId('1abc'), null);
    assert.equal(_test.validId('0'), null);
});

test('overview dates reject invalid and oversized ranges', () => {
    assert.equal(_test.rangeFrom({ from: '2026-02-30', to: '2026-03-05' }), null);
    assert.equal(_test.rangeFrom({ from: '2025-01-01', to: '2026-12-31' }), null);
    const range = _test.rangeFrom({ from: '2026-10-01', to: '2026-10-22' });
    assert.equal(range.fromText, '2026-10-01');
    assert.equal(range.endExclusive.toISOString(), '2026-10-23T00:00:00.000Z');
});
