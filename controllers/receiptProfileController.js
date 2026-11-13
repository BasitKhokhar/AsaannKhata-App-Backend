const prisma = require('../prisma/client');
const { normalizeReceiptConfig } = require('../services/receiptProfiles');
exports.get = async (req, res, next) => {
  try { res.json({ profile: await prisma.receiptProfile.findUnique({ where: { shopId: req.tenant.shopId } }), barcodeReceiptsVersion: 1 }); }
  catch (error) { next(error); }
};
exports.put = async (req, res, next) => {
  const { version, config } = req.body || {};
  if (!Number.isInteger(version) || version < 0 || !config || typeof config !== 'object' || Array.isArray(config) || JSON.stringify(config).length > 75000) return res.status(400).json({ message: 'Invalid receipt settings' });
  try {
    const profile = await prisma.$transaction(async (tx) => {
      const shopId = req.tenant.shopId;
      const data = normalizeReceiptConfig(config);
      if (version === 0) return tx.receiptProfile.create({ data: { shopId, config: data } });
      const updated = await tx.receiptProfile.updateMany({ where: { shopId, version }, data: { config: data, version: { increment: 1 } } });
      if (updated.count !== 1) { const error = new Error('receipt.conflict'); error.code = 'RECEIPT_CONFLICT'; throw error; }
      return tx.receiptProfile.findUnique({ where: { shopId } });
    });
    res.json({ profile });
  } catch (error) {
    if (error.code === 'P2002' || error.code === 'RECEIPT_CONFLICT') return res.status(409).json({ message: 'receipt.conflict' });
    next(error);
  }
};
