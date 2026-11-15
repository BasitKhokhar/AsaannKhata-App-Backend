const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeStockType } = require('../../utils/stockType');
const { convertToMl, getVolumeConversionFactor } = require('../../utils/unitConverter');
const { applyBillItemStock } = require('../../services/billStockService');

test('liquid aliases and litre conversion normalize to millilitres', () => {
  assert.equal(normalizeStockType('liquid'), 'LIQUID');
  assert.equal(normalizeStockType('litre'), 'LIQUID');
  assert.equal(convertToMl(2.5, 'liter'), 2500);
  assert.equal(convertToMl(750, 'ml'), 750);
  assert.equal(getVolumeConversionFactor('liter'), 1000);
});

test('liquid bill stock effects use the normalized millilitre counter', async () => {
  const updates = [];
  const tx = { product: { update: async (operation) => updates.push(operation) } };
  const product = { id: 7, shopId: 3 };
  const result = await applyBillItemStock(tx, product, { stockType: 'LIQUID', volumeMl: 1250 }, -1);
  assert.equal(result.quantityForLog, 1250);
  assert.deepEqual(updates[0].data, { stockVolumeMl: { decrement: 1250 } });
});
