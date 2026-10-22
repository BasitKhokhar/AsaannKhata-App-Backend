const test = require('node:test');
const assert = require('node:assert/strict');

const clientPath = require.resolve('../../prisma/client');
const stamp = new Date('2026-01-01T00:00:00.000Z');
const rows = {
    category: Array.from({ length: 501 }, (_, index) => ({ id: index + 1, shopId: 1, updatedAt: stamp })),
    product: [{ id: 1, shopId: 1, updatedAt: stamp }],
    bill: [], stockTransaction: [], customer: [], customerPayment: [],
};

const fakePrisma = Object.fromEntries(Object.entries(rows).map(([name, data]) => [name, {
    findMany: async ({ where, take, orderBy }) => {
        const field = Object.keys(orderBy[0])[0];
        return data.filter((row) => row.shopId === where.shopId && row[field] <= where[field].lte &&
            where.OR.some((condition) => condition[field].gt
                ? row[field] > condition[field].gt
                : row[field].getTime() === condition[field].getTime() && row.id > condition.id.gt))
            .slice(0, take);
    },
}]));
require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: fakePrisma };
const { pullChanges } = require('../../services/syncService');

test('pull returns all 501 equal-timestamp rows exactly once', async () => {
    const first = await pullChanges({ shopId: 1 }, undefined);
    assert.equal(first.categories.length, 500);
    assert.equal(first.products.length, 1);
    assert.equal(first.hasMore, true);
    const second = await pullChanges({ shopId: 1 }, first.nextSince);
    assert.deepEqual(second.categories.map((row) => row.id), [501]);
    assert.equal(second.products.length, 0);
    assert.equal(second.hasMore, false);
});
