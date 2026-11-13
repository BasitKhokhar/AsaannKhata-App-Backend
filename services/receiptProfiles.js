const RECEIPT_DEFAULTS = {
  paper: '80', fontSize: 11, spacing: 'normal', language: 'en',
  displayName: '', address: '', phone: '', footer: '', logoData: '',
  showLogo: true, showCustomer: true, showPhone: true, showRates: true,
};
function normalizeReceiptConfig(input = {}) {
  const config = { ...RECEIPT_DEFAULTS };
  for (const key of ['displayName', 'address', 'phone', 'footer']) {
    config[key] = String(input[key] ?? '').slice(0, key === 'footer' ? 500 : 200);
  }
  config.paper = ['50', '55', '58', '80', 'A4'].includes(input.paper) ? input.paper : '80';
  config.language = ['en', 'ur', 'hi'].includes(input.language) ? input.language : 'en';
  config.fontSize = Math.min(16, Math.max(9, Number(input.fontSize) || 11));
  config.spacing = input.spacing === 'compact' ? 'compact' : 'normal';
  for (const key of ['showLogo', 'showCustomer', 'showPhone', 'showRates']) config[key] = input[key] !== false;
  config.logoData = typeof input.logoData === 'string' && input.logoData.length <= 70000 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(input.logoData) ? input.logoData : '';
  return config;
}

function receiptSnapshot(input) {
  const snapshot = normalizeReceiptConfig(input);
  for (const key of ['invoiceId', 'issuedAt']) if (typeof input[key] === 'string') snapshot[key] = input[key].slice(0, 100);
  for (const key of ['receivedAtIssue', 'dueAtIssue']) if (Number.isFinite(input[key]) && input[key] >= 0) snapshot[key] = input[key];
  return snapshot;
}
module.exports = { normalizeReceiptConfig, receiptSnapshot };
