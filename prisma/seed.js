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

// SubscriptionPlan catalog — Free, two offline Lifetime plans, and Basic/Pro
// cloud plans with monthly, semiannual, and yearly billing. This seed owns the
// baseline catalog and is idempotent: rerunning it updates the seeded rows to
// the definitions below while preserving their IDs and subscription FKs.
// 36,525 days is approximately 100 years. Existing plan rows are updated by
// the free-plan duration migration and normalized whenever this seed runs.
const FREE_PLAN_DURATION_DAYS = 36525;
const feature = (en, ur, hi) => ({ en, ur, hi });
const OFFLINE_FEATURES = [
    feature('Offline billing and khata records', 'آف لائن بلنگ اور کھاتہ ریکارڈ', 'ऑफ़लाइन बिलिंग और खाता रिकॉर्ड'),
    feature('Product and stock tracking', 'مصنوعات اور اسٹاک کی نگرانی', 'उत्पाद और स्टॉक ट्रैकिंग'),
    feature('Sales reports', 'فروخت کی رپورٹس', 'बिक्री रिपोर्ट'),
];
const BASIC_FEATURES = [
    ...OFFLINE_FEATURES,
    feature('Cloud backup and synchronization', 'کلاؤڈ بیک اپ اور سنکرونائزیشن', 'क्लाउड बैकअप और सिंक्रोनाइज़ेशन'),
    feature('Access your records on up to 2 devices', '2 آلات تک اپنے ریکارڈ تک رسائی', 'अधिकतम 2 डिवाइस पर अपने रिकॉर्ड देखें'),
];
const PRO_FEATURES = [
    feature('Everything included in Basic', 'بیسک پلان کی تمام خصوصیات', 'बेसिक प्लान की सभी सुविधाएं'),
    feature('Cloud backup and synchronization', 'کلاؤڈ بیک اپ اور سنکرونائزیشن', 'क्लाउड बैकअप और सिंक्रोनाइज़ेशन'),
    feature('Detailed product and category analytics', 'مصنوعات اور کیٹیگری کی تفصیلی تجزیات', 'विस्तृत उत्पाद और श्रेणी विश्लेषण'),
    feature('Profit trend reporting', 'منافع کے رجحان کی رپورٹس', 'लाभ रुझान रिपोर्टिंग'),
    feature('Access your records on up to 5 devices', '5 آلات تک اپنے ریکارڈ تک رسائی', 'अधिकतम 5 डिवाइस पर अपने रिकॉर्ड देखें'),
];
const PRODUCT_IDS = {
    LIFETIME_SINGLE_SHOP: { env: 'REVENUECAT_LIFETIME_SINGLE_SHOP_PRODUCT_ID', fallback: 'lifetime_offline_single_shop' },
    LIFETIME_MULTI_SHOP: { env: 'REVENUECAT_LIFETIME_MULTI_SHOP_PRODUCT_ID', fallback: 'lifetime_offline_multi_shop' },
    BASIC_MONTHLY: { env: 'REVENUECAT_BASIC_MONTHLY_PRODUCT_ID', fallback: 'asaandukaan_basic:monthly' },
    BASIC_SEMIANNUAL: { env: 'REVENUECAT_BASIC_SEMIANNUAL_PRODUCT_ID', fallback: 'asaandukaan_basic:six-month' },
    BASIC_YEARLY: { env: 'REVENUECAT_BASIC_YEARLY_PRODUCT_ID', fallback: 'asaandukaan_basic:yearly' },
    PRO_MONTHLY: { env: 'REVENUECAT_PRO_MONTHLY_PRODUCT_ID', fallback: 'asaandukaan_pro:monthly' },
    PRO_SEMIANNUAL: { env: 'REVENUECAT_PRO_SEMIANNUAL_PRODUCT_ID', fallback: 'asaandukaan_pro:six-month' },
    PRO_YEARLY: { env: 'REVENUECAT_PRO_YEARLY_PRODUCT_ID', fallback: 'asaandukaan_pro:yearly' },
};

const SUBSCRIPTION_PLANS = [
    {
        code: 'FREE_TRIAL',
        name: 'Free Plan',
        description: 'Core bookkeeping for getting started.',
        features: [...OFFLINE_FEATURES, feature('Access on 1 device', '1 آلے پر رسائی', '1 डिवाइस पर एक्सेस')],
        tier: 'FREE_TRIAL',
        price: 0,
        durationDays: FREE_PLAN_DURATION_DAYS,
        isTrialPlan: true,
        cloudEnabled: false,
        offlineEnabled: true,
        maxDevices: 1,
        sortOrder: 1,
    },
    {
        code: 'LIFETIME_SINGLE_SHOP',
        name: 'Lifetime Single Shop',
        description: 'One-time purchase for one shop with offline access.',
        features: [
            feature('Lifetime offline access', 'تاحیات آف لائن رسائی', 'लाइफटाइम ऑफलाइन एक्सेस'),
            feature('One shop', 'ایک دکان', 'एक दुकान'),
            ...OFFLINE_FEATURES,
            feature('No recurring payment', 'کوئی بار بار ادائیگی نہیں', 'कोई आवर्ती भुगतान नहीं'),
        ],
        tier: 'LIFETIME',
        price: 0,
        isLifetime: true,
        cloudEnabled: false,
        offlineEnabled: true,
        maxDevices: 1,
        sortOrder: 10,
    },
    {
        code: 'LIFETIME_MULTI_SHOP',
        name: 'Lifetime Multi Shop',
        description: 'One-time purchase for multiple shops with offline access.',
        features: [
            feature('Lifetime offline access', 'تاحیات آف لائن رسائی', 'लाइफटाइम ऑफलाइन एक्सेस'),
            feature('Multiple shops', 'متعدد دکانیں', 'कई दुकानें'),
            ...OFFLINE_FEATURES,
            feature('No recurring payment', 'کوئی بار بار ادائیگی نہیں', 'कोई आवर्ती भुगतान नहीं'),
        ],
        tier: 'LIFETIME',
        price: 0,
        isLifetime: true,
        cloudEnabled: false,
        offlineEnabled: true,
        maxDevices: 2,
        sortOrder: 11,
    },
    {
        code: 'BASIC_MONTHLY',
        name: 'Basic',
        description: 'Essential cloud backup and sync.',
        features: BASIC_FEATURES,
        tier: 'CLOUD_SYNC',
        billingCycle: 'MONTHLY',
        price: 0,
        isRecurring: true,
        cloudEnabled: true,
        offlineEnabled: true,
        maxDevices: 2,
        sortOrder: 20,
    },
    {
        code: 'BASIC_SEMIANNUAL',
        name: 'Basic',
        description: 'Essential cloud backup and sync.',
        features: BASIC_FEATURES,
        tier: 'CLOUD_SYNC',
        billingCycle: 'SEMIANNUAL',
        price: 0,
        isRecurring: true,
        cloudEnabled: true,
        offlineEnabled: true,
        maxDevices: 2,
        sortOrder: 21,
    },
    {
        code: 'BASIC_YEARLY',
        name: 'Basic',
        description: 'Essential cloud backup and sync.',
        features: BASIC_FEATURES,
        tier: 'CLOUD_SYNC',
        billingCycle: 'YEARLY',
        price: 0,
        isRecurring: true,
        cloudEnabled: true,
        offlineEnabled: true,
        maxDevices: 2,
        sortOrder: 22,
    },
    {
        code: 'PRO_MONTHLY',
        name: 'Pro',
        description: 'Advanced cloud reporting and multi-device access.',
        features: PRO_FEATURES,
        tier: 'CLOUD_SYNC',
        billingCycle: 'MONTHLY',
        price: 0,
        isRecurring: true,
        cloudEnabled: true,
        offlineEnabled: true,
        maxDevices: 5,
        sortOrder: 30,
    },
    {
        code: 'PRO_SEMIANNUAL',
        name: 'Pro',
        description: 'Advanced cloud reporting and multi-device access.',
        features: PRO_FEATURES,
        tier: 'CLOUD_SYNC',
        billingCycle: 'SEMIANNUAL',
        price: 0,
        isRecurring: true,
        cloudEnabled: true,
        offlineEnabled: true,
        maxDevices: 5,
        sortOrder: 31,
    },
    {
        code: 'PRO_YEARLY',
        name: 'Pro',
        description: 'Advanced cloud reporting and multi-device access.',
        features: PRO_FEATURES,
        tier: 'CLOUD_SYNC',
        billingCycle: 'YEARLY',
        price: 0,
        isRecurring: true,
        cloudEnabled: true,
        offlineEnabled: true,
        maxDevices: 5,
        sortOrder: 32,
    },
];

const LEGACY_PLAN_CODES = {
    // Match the old catalog's two-device Lifetime and five-device Cloud Sync
    // entitlements so rerunning the seed never downgrades an existing owner.
    LIFETIME: 'LIFETIME_MULTI_SHOP',
    CLOUD_SYNC_MONTHLY: 'PRO_MONTHLY',
    CLOUD_SYNC_SEMIANNUAL: 'PRO_SEMIANNUAL',
    CLOUD_SYNC_YEARLY: 'PRO_YEARLY',
};

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
    for (const [legacyCode, replacementCode] of Object.entries(LEGACY_PLAN_CODES)) {
        const [legacy, replacement] = await Promise.all([
            prisma.subscriptionPlan.findUnique({ where: { code: legacyCode } }),
            prisma.subscriptionPlan.findUnique({ where: { code: replacementCode } }),
        ]);
        if (legacy && !replacement) {
            await prisma.subscriptionPlan.update({ where: { id: legacy.id }, data: { code: replacementCode } });
            console.log(`  ~ migrated SubscriptionPlan ${legacyCode} -> ${replacementCode}`);
        } else if (legacy && replacement) {
            await prisma.subscriptionPlan.update({
                where: { id: legacy.id },
                data: { isActive: false, revenueCatProductId: null },
            });
            console.log(`  ~ deactivated duplicate legacy SubscriptionPlan ${legacyCode}`);
        }
    }

    for (const plan of SUBSCRIPTION_PLANS) {
        const { code, ...definedPlanData } = plan;
        const planData = {
            billingCycle: null,
            currency: 'PKR',
            durationDays: null,
            isLifetime: false,
            isRecurring: false,
            isTrialPlan: false,
            cloudEnabled: false,
            offlineEnabled: true,
            maxDevices: 1,
            ...definedPlanData,
        };
        const productConfig = PRODUCT_IDS[code];
        const revenueCatProductId = productConfig
            ? process.env[productConfig.env]?.trim() || productConfig.fallback
            : null;
        await prisma.subscriptionPlan.upsert({
            where: { code },
            create: { code, ...planData, revenueCatProductId },
            update: { ...planData, revenueCatProductId, isActive: true },
        });
        console.log(`  = seeded SubscriptionPlan ${code}`);
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
