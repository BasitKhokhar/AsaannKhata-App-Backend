# Deploying the SaaS multi-tenant upgrade

## Shop query indexes (2026-10-24)

Migration `20261024000000_shop_query_indexes` adds composite indexes for
shop-scoped category, product, bill, stock-transaction, customer, and payment
history queries. It does not change or remove records. Run
`npx prisma migrate deploy` during the backend deployment before relying on the new indexes in
production; adding indexes to large tables can take time, so schedule the
migration accordingly. The frontend's separate Drizzle migrations
`0004_greedy_gauntlet` and `0005_thankful_piledriver` are applied on app startup.

This backend was restructured from a single-vertical (aluminum/glass) POS into
a multi-tenant SaaS covering multiple shop verticals, subscriptions, and
device sync. The schema change is shipped as two migrations:

1. `20260812065037_baseline` — a no-op snapshot of the schema as it existed
   before this restructuring (establishes migration history; nothing to run
   manually for this one).
2. `20260812070000_saas_multitenant_upgrade` — the actual restructuring.
   Written by hand (not raw `prisma migrate dev` output) so it's safe to run
   against a database that already has real rows: every new `NOT NULL` column
   is added nullable, backfilled, then tightened, and the `Product.stockType`
   / `BillItem.stockType` / `Bill.status` string→enum conversions normalize
   existing lowercase values first. On an empty database all the
   backfill/normalization steps are no-ops.

## Deployment steps (run in order, against the target database)

1. **Back up the database.** Standard precaution before any schema migration.

2. **Pre-flight check** — confirm no two shops already share a category name
   (the old `Category.name` unique constraint made this structurally
   impossible, so this should always report clean, but it's a cheap safety
   net before the constraint changes shape):
   ```
   node prisma/migrate-scripts/checkCategoryDuplicates.js
   ```
   If it reports collisions, rename the offending categories before continuing.

3. **Apply the migrations:**
   ```
   npx prisma migrate deploy
   ```

4. **Generate the Prisma client** (if not already part of your build step):
   ```
   npx prisma generate
   ```

5. **Seed the ShopType and SubscriptionPlan catalogs.** The migration already
   inserts the initial 13 `ShopType` rows (required for step 6's backfill),
   so this mainly upserts the 9 `SubscriptionPlan` rows. Safe to re-run; it
   also migrates the legacy Lifetime and Cloud Sync plan codes while preserving
   their IDs and existing subscription foreign keys:
   ```
   node prisma/seed.js
   ```

6. **Grandfather existing Admin accounts onto the LIFETIME_SINGLE_SHOP plan.** Every
   Admin that predates the subscription system gets a permanent, offline-only
   `LIFETIME_SINGLE_SHOP` subscription so they're never blocked by the new entitlement
   checks. Safe to re-run — skips admins that already have a subscription:
   ```
   node prisma/migrate-scripts/backfillAdminSubscriptions.js
   ```

7. **Configure RevenueCat** (if not already done): set `REVENUECAT_WEBHOOK_SECRET`
   and `REVENUECAT_API_KEY` in `.env`, create the RevenueCat products/offerings,
   and set each paid `SubscriptionPlan.revenueCatProductId` to match (via the
   superadmin plan API — `PUT /superadmin/plans/update/:id`).

8. **Restart the app.** `ENABLE_CRON=true` in `.env` starts the hourly
   subscription-expiry sweep on boot.

## Rollback

Both migrations are additive/backfill-only — nothing in
`saas_multitenant_upgrade` drops a column or table that existed before it, so
there's no destructive step to reverse. If something goes wrong mid-deploy,
restore from the backup taken in step 1 rather than attempting a partial
rollback.
