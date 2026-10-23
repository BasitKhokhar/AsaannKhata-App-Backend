const test = require('node:test');
const assert = require('node:assert/strict');

const clientPath = require.resolve('../../prisma/client');
const stamp = new Date('2026-01-01T00:00:00.000Z');
const rows = {
    category: Array.from({ length: 501 }, (_, index) => ({ id: index + 1, shopId: 1, updatedAt: stamp })),
    product: [{ id: 1, shopId: 1, updatedAt: stamp }],
    bill: [], stockTransaction: [], customer: [], customerPayment: [],
    expense: [{ id: 1, shopId: 1, updatedAt: stamp }],
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
const { pullChanges, pushStockAdjustments, pushBills } = require('../../services/syncService');

test('pull returns all 501 equal-timestamp rows exactly once', async () => {
    const first = await pullChanges({ shopId: 1 }, undefined);
    assert.equal(first.categories.length, 500);
    assert.equal(first.products.length, 1);
    assert.equal(first.expenses.length, 1);
    assert.equal(first.hasMore, true);
    const second = await pullChanges({ shopId: 1 }, first.nextSince);
    assert.deepEqual(second.categories.map((row) => row.id), [501]);
    assert.equal(second.products.length, 0);
    assert.equal(second.expenses.length, 0);
    assert.equal(second.hasMore, false);
});

test('synced stock adjustment records one audit row without applying its snapshot twice', async () => {
    let productUpdates = 0;
    const logs = [];
    fakePrisma.$transaction = async (callback) => callback(fakePrisma);
    fakePrisma.product.findFirst = async () => ({ id: 7, shopId: 1, stockQuantity: 4 });
    fakePrisma.product.update = async () => { productUpdates += 1; };
    fakePrisma.stockTransaction.findFirst = async () => null;
    fakePrisma.stockTransaction.create = async ({ data }) => {
        logs.push(data);
        return { id: 11, ...data };
    };
    const results = await pushStockAdjustments({ shopId: 1 }, 'device-1', [{
        clientId: 'adjustment-1',
        payload: { productId: 7, type: 'OUT', quantity: 2 },
    }]);
    assert.equal(results[0].status, 'created');
    assert.equal(productUpdates, 0);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].clientId, 'adjustment-1');
});
test('synced bill retains payment method and matches its sale log without changing stock again', async () => {
    let productUpdates = 0;
    const logs = [];
    let createdBill;
    fakePrisma.$transaction = async (callback) => callback(fakePrisma);
    fakePrisma.bill.findFirst = async () => null;
    fakePrisma.bill.create = async ({ data }) => {
        createdBill = data;
        return { id: 19, ...data };
    };
    fakePrisma.billItem = { create: async () => ({ id: 20 }) };
    fakePrisma.product.findFirst = async () => ({ id: 7, shopId: 1, stockQuantity: 4 });
    fakePrisma.product.update = async () => { productUpdates += 1; };
    fakePrisma.stockTransaction.create = async ({ data }) => {
        logs.push(data);
        return { id: 21, ...data };
    };
    const results = await pushBills({ shopId: 1 }, 'device-1', [{
        clientId: 'bill-1',
        payload: {
            customerName: 'Walk-in', subtotal: 100, totalAmount: 100,
            totalReceived: 100, paymentMethod: 'CARD', status: 'PAID',
            items: [{ productId: 7, productName: 'Milk', stockType: 'QUANTITY', quantity: 1,
                pricePerUnit: 100, total: 100, stockTransactionClientId: 'sale-log-1' }],
        },
    }]);
    assert.equal(results[0].status, 'created');
    assert.equal(createdBill.paymentMethod, 'CARD');
    assert.equal(productUpdates, 0);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].clientId, 'sale-log-1');
});
