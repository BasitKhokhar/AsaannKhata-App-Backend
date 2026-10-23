const METHODS = new Set(['UNSPECIFIED', 'CASH', 'CARD', 'MOBILE_WALLET', 'CREDIT']);

function normalizePaymentMethod(input) {
    const method = String(input || 'UNSPECIFIED').toUpperCase();
    if (!METHODS.has(method)) {
        throw new Error('Invalid payment method');
    }
    return method;
}

module.exports = { normalizePaymentMethod };
