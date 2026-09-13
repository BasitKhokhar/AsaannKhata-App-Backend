const path = require('path');
const admin = require('firebase-admin');

// Lazily initializes firebase-admin from a service account, tried in order:
//   1. FIREBASE_SERVICE_ACCOUNT_JSON — the service account as a raw JSON string
//   2. FIREBASE_SERVICE_ACCOUNT_PATH — a file path to the service account JSON
// Neither is configured yet in this environment, so this module must degrade
// gracefully rather than throw: everything that would call into Firebase
// instead gets a no-op messaging stub, and a single warning is logged the
// first time initialization is attempted.
let initialized = false;
let warned = false;

function warnOnce(message, err) {
    if (warned) return;
    warned = true;
    if (err) {
        console.warn(`[firebaseAdmin] ${message}:`, err.message);
    } else {
        console.warn(`[firebaseAdmin] ${message}`);
    }
}

function ensureInitialized() {
    if (initialized) return true;

    try {
        let credential = null;

        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
            credential = admin.credential.cert(serviceAccount);
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
            const serviceAccount = require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
            credential = admin.credential.cert(serviceAccount);
        }

        if (!credential) {
            warnOnce('No Firebase service account configured (set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH) — push notifications are disabled');
            return false;
        }

        admin.initializeApp({
            credential,
            projectId: process.env.FIREBASE_PROJECT_ID || undefined,
        });
        initialized = true;
        return true;
    } catch (err) {
        warnOnce('Failed to initialize Firebase Admin SDK — push notifications are disabled', err);
        return false;
    }
}

// No-op stand-in so calling code (fcmService) never has to special-case
// "Firebase isn't configured" — it just gets a multicast response with
// nothing sent.
const noopMessaging = {
    async sendEachForMulticast() {
        return { responses: [], successCount: 0, failureCount: 0 };
    },
};

module.exports = {
    messaging() {
        return ensureInitialized() ? admin.messaging() : noopMessaging;
    },
};
