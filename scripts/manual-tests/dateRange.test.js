const test = require('node:test');
const assert = require('node:assert/strict');
const { dateRange } = require('../../utils/dateRange');

test('dateRange expands date-only values to UTC day boundaries', () => {
    const range = dateRange('2026-11-01', '2026-11-17');
    assert.equal(range.gte.toISOString(), '2026-11-01T00:00:00.000Z');
    assert.equal(range.lte.toISOString(), '2026-11-17T23:59:59.999Z');
});

test('dateRange accepts the ISO timestamps sent by the mobile frontend', () => {
    const range = dateRange('2026-11-16T19:00:00.000Z', '2026-11-17T18:59:59.999Z');
    assert.equal(range.gte.toISOString(), '2026-11-16T19:00:00.000Z');
    assert.equal(range.lte.toISOString(), '2026-11-17T18:59:59.999Z');
});

test('dateRange rejects malformed and reversed ranges', () => {
    assert.throws(() => dateRange('not-a-date', '2026-11-17'), { code: 'INVALID_DATE_RANGE' });
    assert.throws(() => dateRange('2026-11-18', '2026-11-17'), { code: 'INVALID_DATE_RANGE' });
});
