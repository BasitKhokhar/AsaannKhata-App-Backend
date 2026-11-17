const test = require('node:test');
const assert = require('node:assert/strict');

const prismaPath = require.resolve('../../prisma/client');
const servicePath = require.resolve('../../services/syncService');

function createPrisma(initialDevices) {
    const devices = initialDevices.map((device) => ({ ...device }));
    const device = {
        async findFirst({ where }) {
            return devices.find((row) => row.shopId === where.shopId && row.deviceId === where.deviceId) || null;
        },
        async count({ where }) {
            return devices.filter((row) => row.shopId === where.shopId && row.isActive === where.isActive).length;
        },
        async findMany({ where, take }) {
            return devices
                .filter((row) => row.shopId === where.shopId && row.isActive && row.deviceId !== where.deviceId.not)
                .sort((a, b) => new Date(a.lastSeenAt) - new Date(b.lastSeenAt) || a.id - b.id)
                .slice(0, take)
                .map(({ id }) => ({ id }));
        },
        async updateMany({ where, data }) {
            for (const row of devices) {
                if (where.id.in.includes(row.id) && row.shopId === where.shopId) Object.assign(row, data);
            }
        },
        async upsert({ where, update, create }) {
            let row = devices.find((candidate) =>
                candidate.shopId === where.shopId_deviceId.shopId && candidate.deviceId === where.shopId_deviceId.deviceId
            );
            if (row) Object.assign(row, update);
            else {
                row = { id: devices.length + 1, isActive: true, lastSeenAt: new Date(), ...create };
                devices.push(row);
            }
            return row;
        },
    };
    return { devices, device, async $transaction(fn) { return fn({ device }); } };
}

function loadService(prisma) {
    delete require.cache[servicePath];
    require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
    return require(servicePath);
}

const oldDevice = () => ({
    id: 1,
    shopId: 7,
    deviceId: 'old-install',
    isActive: true,
    fcmToken: 'old-token',
    lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
});

test('registration reports the device limit unless replacement is explicitly requested', async () => {
    const prisma = createPrisma([oldDevice()]);
    const service = loadService(prisma);

    await assert.rejects(
        service.registerDevice({ adminId: 3, shopId: 7 }, { deviceId: 'new-install' }, 1),
        (error) => error.code === 'DEVICE_LIMIT_REACHED'
    );
    assert.equal(prisma.devices[0].isActive, true);
});

test('explicit replacement deactivates the least-recent device and clears its push token', async () => {
    const prisma = createPrisma([oldDevice()]);
    const service = loadService(prisma);

    const registered = await service.registerDevice(
        { adminId: 3, shopId: 7 },
        { deviceId: 'new-install', deviceName: 'Phone', platform: 'android', replaceExisting: true },
        1
    );

    assert.equal(registered.deviceId, 'new-install');
    assert.equal(registered.isActive, true);
    assert.equal(prisma.devices.find((row) => row.deviceId === 'old-install').isActive, false);
    assert.equal(prisma.devices.find((row) => row.deviceId === 'old-install').fcmToken, null);
});

test('an inactive known installation still needs a free slot before reactivation', async () => {
    const prisma = createPrisma([
        oldDevice(),
        { id: 2, shopId: 7, deviceId: 'returning-install', isActive: false, lastSeenAt: new Date('2026-02-01T00:00:00.000Z') },
    ]);
    const service = loadService(prisma);

    await assert.rejects(
        service.registerDevice({ adminId: 3, shopId: 7 }, { deviceId: 'returning-install' }, 1),
        (error) => error.code === 'DEVICE_LIMIT_REACHED'
    );
});
