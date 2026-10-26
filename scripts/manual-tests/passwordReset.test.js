const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

process.env.REFRESH_SECRET = process.env.REFRESH_SECRET || 'test_refresh_secret_at_least_32_characters';

let resetRow = null;
let deliveredCode = null;
let admin = { id: 7, email: 'owner@example.com', password: 'old-hash', refreshToken: 'old-session', tokenVersion: 0, isActive: true };
const matches = (row, where) => row && row.adminId === where.adminId && (!where.codeHash || row.codeHash === where.codeHash)
  && (!where.expiresAt || row.expiresAt > where.expiresAt.gt) && (!where.attempts || row.attempts < where.attempts.lt);
const passwordReset = {
  findUnique: async () => resetRow,
  upsert: async ({ create, update }) => { resetRow = resetRow ? { ...resetRow, ...update } : { ...create, attempts: 0 }; },
  deleteMany: async ({ where }) => {
    if (!matches(resetRow, where)) return { count: 0 };
    resetRow = null;
    return { count: 1 };
  },
  updateMany: async ({ where }) => {
    if (!matches(resetRow, where)) return { count: 0 };
    resetRow.attempts += 1;
    return { count: 1 };
  },
};
const prisma = {
  admin: {
    findUnique: async ({ where }) => (where.email === admin.email || where.id === admin.id) ? admin : null,
    update: async ({ data }) => { admin = { ...admin, password: data.password, refreshToken: data.refreshToken, tokenVersion: admin.tokenVersion + 1 }; },
  },
  passwordReset,
  $transaction: async (fn) => fn(prisma),
};
const prismaPath = require.resolve('../../prisma/client');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const mailPath = require.resolve('../../services/mailService');
require.cache[mailPath] = { id: mailPath, filename: mailPath, loaded: true, exports: { sendPasswordResetCode: async (_email, code) => { deliveredCode = code; } } };
const { requestPasswordReset, resetPassword } = require('../../controllers/authController');

async function call(handler, body) {
  const result = { statusCode: 200, body: null };
  const res = { status(code) { result.statusCode = code; return this; }, json(value) { result.body = value; return this; } };
  await handler({ body }, res);
  return result;
}

test('unknown address gets the same generic response and no code', async () => {
  const unknown = await call(requestPasswordReset, { email: 'unknown@example.com' });
  assert.equal(unknown.statusCode, 202);
  assert.equal(deliveredCode, null);
  const known = await call(requestPasswordReset, { email: admin.email });
  assert.equal(known.statusCode, 202);
  assert.deepEqual(unknown.body, known.body);
  assert.match(deliveredCode, /^\d{6}$/);
  assert.notEqual(resetRow.codeHash, deliveredCode);
});

test('wrong code fails and correct code changes password once and revokes sessions', async () => {
  const wrong = await call(resetPassword, { email: admin.email, code: '999999' === deliveredCode ? '000000' : '999999', newPassword: 'long-new-password-123' });
  assert.equal(wrong.statusCode, 400);
  assert.equal(resetRow.attempts, 1);
  const right = await call(resetPassword, { email: admin.email, code: deliveredCode, newPassword: 'long-new-password-123' });
  assert.equal(right.statusCode, 200);
  assert.equal(admin.refreshToken, null);
  assert.equal(admin.tokenVersion, 1);
  assert.equal(await bcrypt.compare('long-new-password-123', admin.password), true);
  const replay = await call(resetPassword, { email: admin.email, code: deliveredCode, newPassword: 'another-password-123' });
  assert.equal(replay.statusCode, 400);
});
