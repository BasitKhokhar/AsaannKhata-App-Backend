// Accepts both the canonical enum values and the older client's lowercase
// aliases ("areabased", "unitbased", ...) so existing frontend payloads keep
// working while the API contract moves to StockType enum values.
const STOCK_TYPE_ALIASES = {
    quantity: 'QUANTITY',
    unitbased: 'QUANTITY',
    area: 'AREA',
    areabased: 'AREA',
    length: 'LENGTH',
    lengthbased: 'LENGTH',
    pack: 'PACK',
    packbased: 'PACK',
    liquid: 'LIQUID',
    liquidbased: 'LIQUID',
    litre: 'LIQUID',
    liter: 'LIQUID',
};

function normalizeStockType(input) {
    const key = (input || 'quantity').toString().toLowerCase();
    return STOCK_TYPE_ALIASES[key] || 'QUANTITY';
}

module.exports = { normalizeStockType };
