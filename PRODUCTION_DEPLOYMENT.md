# AsaanKhata API deployment

## Configure the VPS

Use Node.js 22 or newer, MySQL, HTTPS, and one trusted reverse proxy. Keep the API process private to the proxy. Copy `.env.example` to `.env` and set real values on the server; `.env` is ignored by Git. Generate **different** random values of at least 32 characters for `JWT_SECRET` and `REFRESH_SECRET`. Change any credential that has been shared in chat or source control before launch. Never copy credentials from another app or put `SMTP_PASS` or reviewer passwords in the Expo environment.

Set `NODE_ENV=production`, `DATABASE_URL` with a dedicated least-privilege MySQL account, `BUCKET_PATH`, and `BUCKET_BASE_URL`. The proxy or web server must serve the bucket directory at the exact public URL configured by `BUCKET_BASE_URL`; the Express API does not serve the files. Restrict the bucket directory to the application user and allow only images to be served. Set `TRUST_PROXY_HOPS=1` only if there is exactly one reverse proxy between clients and Node. Set `CORS_ALLOWED_ORIGINS` to exact HTTPS origins for any browser admin panel; the native app does not send an Origin header.

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`. The reset flow sends a six digit code valid for ten minutes. Production startup fails when SMTP configuration is absent. Test delivery from the VPS to a real mailbox, including spam placement. The reset endpoint returns the same acceptance response for known and unknown addresses.
JSON requests are capped at 1 MB, except sync pushes at 5 MB and 100 operations per request. Image uploads are capped at 5 MB and accept JPEG, PNG, WebP, or GIF content.

If using RevenueCat, set `REVENUECAT_WEBHOOK_SECRET` and the matching dashboard Authorization value. If using FCM, set `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_PATH`; the individual `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` values alone are not read by the current Firebase initializer. `ENABLE_CRON=true` should run on just one instance.
The Google Play Publisher keys and fixed reviewer OTP from the separate Spatia project do not belong in this API. This app uses RevenueCat for purchase verification.

## Deploy

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm run seed
NODE_ENV=production npm start
```

Run behind a process supervisor. Preserve the `.env`, upload directory, and MySQL data across releases. Take a database backup before migrations and schedule ongoing backups. Check `GET /health` for process liveness and `GET /db-status` for database readiness. The latter gives a generic response on failure.

The frontend's production EAS environment must set `EXPO_PUBLIC_API_BASE_URL` to the HTTPS API origin without an `/api` suffix. Rebuild the app after changing it. The Play review email and password variables are server-side operator placeholders: create an ordinary account through registration, verify it can sign in and access the needed screens, and enter its credentials in Play Console app access instructions. Do not add a reviewer login bypass or put the password into the mobile bundle. The free plan defaults to 36,525 days (about 100 years); check the review account's entitlement if its plan has been changed through the superadmin API.

## Release gates still requiring verification

- The migration and SMTP delivery could not be exercised against a live MySQL/SMTP environment here. Test registration, reset, replay rejection, login, account suspension, and refresh rotation on staging after `migrate deploy`.
- Rate limiting uses an in-memory store and is appropriate for a single Node process. Multiple workers or hosts need a shared store and proxy level protection.
- `POST /ads/reward` currently trusts an authenticated client's claim that an ad was watched. Add server-side ad reward verification before allowing rewards in production; a rate limit alone does not prove ad completion.
- The frontend's existing production roadmap still lists account deletion, full account/device isolation, and sync/inventory accounting gaps. Review and close those product gates before claiming a full public release.
- `npm audit` still reports three high findings in Prisma's toolchain dependency chain (`deepmerge-ts`, `@prisma/config`, `prisma`). Evaluate a compatible Prisma upgrade before release.
- The frontend audit has 19 remaining findings (15 high, four moderate) after non-breaking updates. The critical finding was removed; the remaining findings involve Expo, Firebase, and build-tool dependency chains and need compatible upstream fixes. Do not use `npm audit fix --force`, which proposes incompatible Expo downgrades.
