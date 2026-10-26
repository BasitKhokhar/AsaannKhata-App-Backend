require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const multer = require('multer');
const prisma = require('./prisma/client');

const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const shopTypeRoutes = require('./routes/shopTypeRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const billingRoutes = require('./routes/billingRoutes');
const stockRoutes = require('./routes/stockRoutes');
const customerRoutes = require('./routes/customerRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const syncRoutes = require('./routes/syncRoutes');
const adsRoutes = require('./routes/adsRoutes');
const notificationsRoutes = require('./routes/notificationsRoutes');

const app = express();
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (Number.isInteger(proxyHops) && proxyHops > 0) app.set('trust proxy', proxyHops);
app.disable('x-powered-by');
app.use(helmet());
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && !allowedOrigins.length)) return callback(null, true);
  return callback(new Error('CORS origin denied'));
} }));
const limitOptions = { windowMs: 15 * 60 * 1000, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many requests. Try again later.' } };
const positiveInt = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
app.use(rateLimit({ ...limitOptions, limit: positiveInt(process.env.RATE_LIMIT_MAX, 300), skip: (req) => req.path === '/health' }));
const standardJson = express.json({ limit: '1mb' });
const syncJson = express.json({ limit: '5mb' });
app.use((req, res, next) => (req.path.startsWith('/sync/push/') ? syncJson : standardJson)(req, res, next));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body) => process.env.NODE_ENV === 'production' && res.statusCode >= 500
    ? sendJson({ message: 'Internal server error' }) : sendJson(body);
  next();
});

// Route groups
app.use('/auth', authRoutes);
app.use('/shops', shopRoutes);
app.use('/shop-types', shopTypeRoutes);
app.use('/categories', categoryRoutes);
app.use('/products', productRoutes);
app.use('/billing', billingRoutes);
app.use('/stock', stockRoutes);
app.use('/customers', customerRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/subscriptions', subscriptionRoutes);
app.use('/superadmin', superAdminRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/sync', syncRoutes);
app.use('/ads', adsRoutes);
app.use('/notifications', notificationsRoutes);

app.get('/', (req, res) => res.json({ name: 'AsaanKhata API', status: 'ok' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));


app.get('/db-status', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'success', message: 'Database is connected' });
    } catch (error) {
        res.status(503).json({ status: 'error', message: 'Database connection failed' });
    }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: 'Invalid or oversized upload' });
  if (err.code === 'INVALID_IMAGE') return res.status(400).json({ message: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request body too large' });
  if (err.message === 'CORS origin denied') return res.status(403).json({ message: 'Origin denied' });
  console.error('Unhandled request error:', err);
  return res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;
