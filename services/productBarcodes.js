function normalize(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('barcode.invalid');
  const code = value.trim();
  if (!code) return null;
  if (code.length > 128 || /[\x00-\x1f\x7f]/.test(code)) throw new Error('barcode.invalid');
  return /^0\d{12}$/.test(code) ? code.slice(1) : code;
}
function barcodeFields(input, existing = {}) {
  const barcode = normalize(input.barcode === undefined ? existing.barcode : input.barcode);
  const looseBarcode = (input.stockType || existing.stockType) === 'PACK' ? normalize(input.looseBarcode === undefined ? existing.looseBarcode : input.looseBarcode) : null;
  if (barcode && barcode === looseBarcode) throw new Error('barcode.duplicate');
  return { barcode, looseBarcode };
}
// Call inside the SAME transaction as the product write. The unique key
// handles concurrent code assignment across devices, pack and loose codes.
async function syncProductBarcodes(tx, product) {
  await tx.productBarcode.deleteMany({ where: { productId: product.id, shopId: product.shopId } });
  if (product.isDeleted) return;
  const data = [[product.barcode, 'default'], [product.looseBarcode, 'loose']]
    .filter(([code]) => code).map(([code, unit]) => ({ shopId: product.shopId, productId: product.id, code, unit }));
  if (data.length) await tx.productBarcode.createMany({ data });
}
module.exports = { normalize, barcodeFields, syncProductBarcodes };
