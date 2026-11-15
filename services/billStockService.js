// Shared stock-effect logic for a single bill line item, used by both
// billingControllers.js (online bill create/update) and syncService.js
// (bills pushed up from an offline device) so the QUANTITY/AREA/LENGTH/PACK
// branching lives in exactly one place.
//
// direction: -1 to decrement stock (item being sold), +1 to increment
// (reverting a sale, e.g. billingControllers.updateBill undoing old items).
// Returns the quantity to write on the matching StockTransaction log row —
// area-mode logs in sheets, pack-mode logs in base units, everything else
// logs in its own unit.
async function applyBillItemStock(tx, product, item, direction) {
    const sign = direction < 0 ? 'decrement' : 'increment';
    const updateData = {};
    let quantityForLog = 0;

    switch (item.stockType) {
        case 'AREA': {
            const totalArea = parseFloat(item.totalArea) || 0;
            let sheetsUsed = parseFloat(item.quantity) || 0;
            if (product.sheetAreaCm2) {
                sheetsUsed = totalArea / product.sheetAreaCm2;
            }
            updateData.stockAreaCm2 = { [sign]: totalArea };
            updateData.stockQuantity = { [sign]: sheetsUsed };
            quantityForLog = sheetsUsed;
            break;
        }
        case 'LENGTH': {
            const lengthCm = parseFloat(item.lengthCm) || 0;
            updateData.stockLengthCm = { [sign]: lengthCm };
            quantityForLog = lengthCm;
            break;
        }
        case 'PACK': {
            const packQty = parseFloat(item.packQuantity) || 0;
            const looseQty = parseFloat(item.looseQuantity) || 0;
            updateData.stockPacks = { [sign]: packQty };
            updateData.stockLooseUnits = { [sign]: looseQty };
            quantityForLog = packQty * (product.packSize || 1) + looseQty;
            break;
        }
        case 'LIQUID': {
            const volumeMl = parseFloat(item.volumeMl) || 0;
            updateData.stockVolumeMl = { [sign]: volumeMl };
            quantityForLog = volumeMl;
            break;
        }
        default: { // QUANTITY
            const qty = parseFloat(item.quantity) || 0;
            updateData.stockQuantity = { [sign]: qty };
            quantityForLog = qty;
        }
    }

    await tx.product.update({ where: { id: product.id, shopId: product.shopId }, data: updateData });
    return { quantityForLog };
}

module.exports = { applyBillItemStock };
