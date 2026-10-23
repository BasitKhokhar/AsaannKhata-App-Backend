require('dotenv').config();
const prisma = require('./client');

// ShopType catalog — the migration already inserts the initial rows; this is
// a backstop for environments that create the DB some other way, and a place
// to add new verticals later without a data migration. Existing rows are
// never overwritten here — once created, they're superadmin-CRUD-managed.
const SHOP_TYPES = [
    { code: 'GLASS_ALUMINUM', label: 'Aluminum & Glass', defaultStockType: 'AREA', sortOrder: 1 },
    { code: 'TILES_MARBLE', label: 'Tiles, Marble & Granite', defaultStockType: 'AREA', sortOrder: 2 },
    { code: 'PLYWOOD_MDF', label: 'Plywood & MDF Boards', defaultStockType: 'AREA', sortOrder: 3 },
    { code: 'FABRIC', label: 'Fabric & Textiles', defaultStockType: 'AREA', sortOrder: 4 },
    { code: 'PIPE_PVC', label: 'Pipe & PVC', defaultStockType: 'LENGTH', sortOrder: 5 },
    { code: 'WOOD_TIMBER', label: 'Wood & Timber', defaultStockType: 'LENGTH', sortOrder: 6 },
    { code: 'CABLE_WIRE', label: 'Cable & Wire', defaultStockType: 'LENGTH', sortOrder: 7 },
    { code: 'HARDWARE', label: 'Hardware & Electrical', defaultStockType: 'QUANTITY', sortOrder: 8 },
    { code: 'GENERAL_STORE', label: 'General Store', defaultStockType: 'QUANTITY', sortOrder: 9 },
    { code: 'STATIONERY', label: 'Stationery', defaultStockType: 'QUANTITY', sortOrder: 10 },
    { code: 'FOOTWEAR', label: 'Footwear', defaultStockType: 'QUANTITY', sortOrder: 11 },
    { code: 'PHARMACY', label: 'Pharmacy', defaultStockType: 'QUANTITY', sortOrder: 12, suggestedCategories: ['Tablets', 'Syrups', 'Injections', 'Surgical'] },
    { code: 'MOBILE_ACCESSORIES', label: 'Mobile Accessories', defaultStockType: 'QUANTITY', sortOrder: 13 },
    { code: 'GROCERY_STORE', label: 'Grocery Store', defaultStockType: 'QUANTITY', sortOrder: 14 },
    { code: 'MILK_SHOP', label: 'Milk Shop', defaultStockType: 'QUANTITY', sortOrder: 15 },
    { code: 'ATTA_CHAKKI', label: 'Atta Chakki', defaultStockType: 'QUANTITY', sortOrder: 16 },
    { code: 'CLOTHING_STORE', label: 'Clothing Store', defaultStockType: 'QUANTITY', sortOrder: 17 },
    { code: 'BAKERY', label: 'Bakery', defaultStockType: 'QUANTITY', sortOrder: 18 },
    { code: 'RESTAURANT', label: 'Restaurant', defaultStockType: 'QUANTITY', sortOrder: 19 },
    { code: 'SALON_SPA', label: 'Salon & Spa', defaultStockType: 'QUANTITY', sortOrder: 20 },
    { code: 'AUTO_PARTS', label: 'Auto Parts', defaultStockType: 'QUANTITY', sortOrder: 21 },
    { code: 'MOBILE_SHOP', label: 'Mobile Shop', defaultStockType: 'QUANTITY', sortOrder: 22 },
];

// SubscriptionPlan catalog — the 3 packages: FREE_TRIAL, LIFETIME, and
// CLOUD_SYNC (3 billing cycles). Editable afterward via the superadmin plan
// CRUD API; this seed only creates rows that don't already exist, so a
// redeploy never clobbers a value a superadmin has since tuned.
const FREE_TRIAL_DAYS = parseInt(process.env.FREE_TRIAL_DAYS, 10) || 15;

const SUBSCRIPTION_PLANS = [
    {
        code: 'FREE_TRIAL',
        name: 'Free Trial',
        tier: 'FREE_TRIAL',
        price: 0,
        durationDays: FREE_TRIAL_DAYS,
        isTrialPlan: true,
        cloudEnabled: false,
        offlineEnabled: true,
        maxDevices: 1,
        sortOrder: 1,
    },
    {
        code: 'LIFETIME',
        name: 'Lifetime (Offline)',
        tier: 'LIFETIME',
        price: 0,
        isLifetime: true,
        cloudEnabled: false,
        offlineEnabled: true,
        maxDevices: 2,
        sortOrder: 2,
    },
    {
        code: 'CLOUD_SYNC_MONTHLY',
        name: 'Cloud Sync — Monthly',
        tier: 'CLOUD_SYNC',
        billingCycle: 'MONTHLY',
        price: 0,
        isRecurring: true,
        cloudEnabled: true,
        offlineEnabled: true,
        maxDevices: 5,
        sortOrder: 3,
    },
    {
        code: 'CLOUD_SYNC_SEMIANNUAL',
        name: 'Cloud Sync — 6 Months',
        tier: 'CLOUD_SYNC',
        billingCycle: 'SEMIANNUAL',
        price: 0,
        isRecurring: true,
        cloudEnabled: true,
        offlineEnabled: true,
        maxDevices: 5,
        sortOrder: 4,
    },
    {
        code: 'CLOUD_SYNC_YEARLY',
        name: 'Cloud Sync — Yearly',
        tier: 'CLOUD_SYNC',
        billingCycle: 'YEARLY',
        price: 0,
        isRecurring: true,
        cloudEnabled: true,
        offlineEnabled: true,
        maxDevices: 5,
        sortOrder: 5,
    },
];

async function seedShopTypes() {
    for (const shopType of SHOP_TYPES) {
        const existing = await prisma.shopType.findUnique({ where: { code: shopType.code } });
        if (!existing) {
            await prisma.shopType.create({ data: shopType });
            console.log(`  + created ShopType ${shopType.code}`);
        }
    }
}

async function seedSubscriptionPlans() {
    for (const plan of SUBSCRIPTION_PLANS) {
        const existing = await prisma.subscriptionPlan.findUnique({ where: { code: plan.code } });
        if (!existing) {
            await prisma.subscriptionPlan.create({ data: plan });
            console.log(`  + created SubscriptionPlan ${plan.code}`);
        }
    }
}

async function main() {
    console.log('Seeding ShopType catalog...');
    await seedShopTypes();
    console.log('Seeding SubscriptionPlan catalog...');
    await seedSubscriptionPlans();
    console.log('Seed complete.');
}

main()
    .catch((err) => {
        console.error('Seed failed:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
