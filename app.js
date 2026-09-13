require('dotenv').config();
const express = require('express');
const cors = require('cors');
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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.get('/', (req, res) => res.send("Hamdan Glass POS Backend by Basit Tech Solutions is live"));


app.get('/db-status', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'success', message: 'Database is connected' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Database connection failed', error: error.message });
    }
});

module.exports = app;
