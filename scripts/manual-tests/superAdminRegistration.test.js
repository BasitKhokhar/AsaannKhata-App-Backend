const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

let account = null;
const prisma = {
    superAdmin: {
        count: async () => account ? 1 : 0,
        create: async ({ data }) => {
            account = { id: 1, ...data, createdAt: new Date() };
            const { password, ...safeAccount } = account;
            return safeAccount;
        },
    },
};
prisma.$transaction = async (callback) => callback(prisma);

const prismaPath = require.resolve('../../prisma/client');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const { registerSuperAdmin } = require('../../controllers/superAdminController');

async function call(body) {
    const result = { statusCode: 200, body: null };
    const res = {
        status(code) { result.statusCode = code; return this; },
        json(value) { result.body = value; return this; },
    };
    await registerSuperAdmin({ body }, res);
    return result;
}

test('registers only the first SuperAdmin and hashes the password', async () => {
    const created = await call({
        name: 'Platform Admin',
        email: 'ADMIN@Example.com',
        password: 'a-secure-password',
    });

    assert.equal(created.statusCode, 201);
    assert.equal(created.body.superAdmin.email, 'admin@example.com');
    assert.equal(created.body.superAdmin.password, undefined);
    assert.equal(await bcrypt.compare('a-secure-password', account.password), true);

    const second = await call({
        name: 'Another Admin',
        email: 'another@example.com',
        password: 'another-secure-password',
    });
    assert.equal(second.statusCode, 403);
});

test('rejects invalid SuperAdmin registration input', async () => {
    const result = await call({ name: 'Admin', email: 'invalid', password: 'short' });
    assert.equal(result.statusCode, 400);
});
