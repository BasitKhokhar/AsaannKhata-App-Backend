const test = require('node:test');
const assert = require('node:assert/strict');
const { barcodeFields, syncProductBarcodes } = require('../../services/productBarcodes');
const { normalizeReceiptConfig, receiptSnapshot } = require('../../services/receiptProfiles');
test('barcode updates preserve old-client fields and enforce pack/loose aliases', () => {
  assert.deepEqual(barcodeFields({}, { stockType: 'PACK', barcode: '00123', looseBarcode: 'piece' }), { barcode: '00123', looseBarcode: 'piece' });
  assert.throws(() => barcodeFields({ stockType: 'PACK', barcode: '0123456789012', looseBarcode: '123456789012' }), /duplicate/);
  assert.deepEqual(barcodeFields({ stockType: 'QUANTITY' }, { barcode: 'x', looseBarcode: 'y' }), { barcode: 'x', looseBarcode: null });
});
test('barcode registry uses transaction client and propagates uniqueness errors', async () => {
  const calls = [];
  const tx = { productBarcode: { deleteMany: async value => calls.push(value), createMany: async () => { throw new Error('unique'); } } };
  await assert.rejects(syncProductBarcodes(tx, { id: 2, shopId: 1, barcode: '123' }), /unique/);
  assert.deepEqual(calls, [{ where: { productId: 2, shopId: 1 } }]);
});
test('receipt snapshots bound data, preserve narrow widths and reject unsafe logos', () => {
  for (const paper of ['50', '55', '58', '80', 'A4']) assert.equal(normalizeReceiptConfig({ paper }).paper, paper);
  const snapshot = receiptSnapshot({ paper: 'invalid', logoData: 'https://tracker.example', footer: 'x'.repeat(1000), receivedAtIssue: 30, dueAtIssue: -1, secret: 'removed' });
  assert.equal(snapshot.paper, '80'); assert.equal(snapshot.logoData, ''); assert.equal(snapshot.footer.length, 500);
  assert.equal(snapshot.receivedAtIssue, 30); assert.equal(snapshot.dueAtIssue, undefined); assert.equal(snapshot.secret, undefined);
});
