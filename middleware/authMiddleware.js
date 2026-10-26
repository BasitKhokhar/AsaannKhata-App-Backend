const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');

// -------------------
// ADMIN MIDDLEWARE (shop owner / tenant)
// -------------------
exports.verifyAdminToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(403).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden: Not an admin' });
    const admin = await prisma.admin.findUnique({ where: { id: decoded.adminId }, select: { id: true, isActive: true, tokenVersion: true } });
    if (!admin || !admin.isActive || admin.tokenVersion !== decoded.tokenVersion) return res.status(401).json({ error: 'Unauthorized' });
    req.admin = { id: admin.id };
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') return res.status(401).json({ error: 'Unauthorized' });
    next(err);
  }
};

// -------------------
// SUPERADMIN MIDDLEWARE (platform owner)
// -------------------
exports.verifySuperAdminToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(403).json({ error: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Unauthorized' });
    if (decoded.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden: Not a superadmin' });

    req.superAdmin = { id: decoded.superAdminId };
    next();
  });
};
