const prisma = require('../prisma/client');
const { applyBillItemStock } = require('./billStockService');
const { adjustCustomerBalance } = require('./customerService');

const PAGE_SIZE = 500;

// ----------------------------------------------------------------------------
// Device registration
// ----------------------------------------------------------------------------

async function registerDevice(tenant, { deviceId, deviceName, platform }, maxDevices) {
    if (!deviceId) {
        const err = new Error('deviceId is required');
        err.code = 'DEVICE_ID_REQUIRED';
        throw err;
    }

    const existing = await prisma.device.findFirst({ where: { shopId: tenant.shopId, deviceId } });

    if (!existing) {
        const activeCount = await prisma.device.count({ where: { shopId: tenant.shopId, isActive: true } });
        if (activeCount >= maxDevices) {
            const err = new Error('Device limit reached for this plan');
            err.code = 'DEVICE_LIMIT_REACHED';
            throw err;
        }
    }

    return prisma.device.upsert({
        where: { shopId_deviceId: { shopId: tenant.shopId, deviceId } },
        update: { deviceName, platform, isActive: true, lastSeenAt: new Date() },
        create: { shopId: tenant.shopId, deviceId, deviceName, platform },
    });
}

// ----------------------------------------------------------------------------
// Incremental pull — server-issued serverTime is the watermark the client
// must persist (never its own clock, to sidestep client/server clock skew).
// ----------------------------------------------------------------------------

async function pullChanges(tenant, sinceIso) {
    // A paginated cursor must include the row ID: timestamps are not unique.
    // Keep one position per table so a busy table cannot skip a quieter one.
    let state;
    try {
        state = sinceIso && sinceIso.startsWith('{') ? JSON.parse(sinceIso) : null;
    } catch (_err) {
        throw new Error('Invalid sync cursor');
    }
    const since = state ? new Date(state.since) : sinceIso ? new Date(sinceIso) : new Date(0);
    const snapshot = state ? new Date(state.snapshot) : new Date();
    if (Number.isNaN(since.getTime()) || Number.isNaN(snapshot.getTime())) {
        throw new Error('Invalid sync cursor');
    }
    const positions = state?.positions || {};
    const specs = [
        ['categories', prisma.category, 'updatedAt'],
        ['products', prisma.product, 'updatedAt'],
        ['bills', prisma.bill, 'updatedAt'],
        ['stockTransactions', prisma.stockTransaction, 'createdAt'],
        ['customers', prisma.customer, 'updatedAt'],
        ['customerPayments', prisma.customerPayment, 'createdAt'],
    ];
    const pages = await Promise.all(specs.map(async ([name, model, field]) => {
        const position = positions[name];
        const after = position ? new Date(position.time) : since;
        if (Number.isNaN(after.getTime())) throw new Error('Invalid sync cursor');
        const where = {
            shopId: tenant.shopId,
            [field]: { lte: snapshot },
            OR: position
                ? [{ [field]: { gt: after } }, { [field]: after, id: { gt: position.id } }]
                : [{ [field]: { gt: since } }],
        };
        const rows = await model.findMany({
            where,
            ...(name === 'bills' ? { include: { items: true } } : {}),
            orderBy: [{ [field]: 'asc' }, { id: 'asc' }],
            take: PAGE_SIZE + 1,
        });
        return [name, field, rows];
    }));
    const result = {};
    const nextPositions = { ...positions };
    let hasMore = false;
    for (const [name, field, rows] of pages) {
        if (rows.length > PAGE_SIZE) hasMore = true;
        result[name] = rows.slice(0, PAGE_SIZE);
        const last = result[name].at(-1);
        if (last) nextPositions[name] = { time: last[field].toISOString(), id: last.id };
    }
    const nextSince = hasMore
        ? JSON.stringify({ since: since.toISOString(), snapshot: snapshot.toISOString(), positions: nextPositions })
        : snapshot.toISOString();

    return {
        serverTime: snapshot.toISOString(),
        nextSince,
        hasMore,
        ...result,
    };
}

// ----------------------------------------------------------------------------
// Push helpers — shared per-operation result shape:
//   { clientId, serverId?, status: 'created'|'updated'|'deleted'|'conflict'|'error', error? }
// ----------------------------------------------------------------------------

async function pushCategories(tenant, deviceId, operations) {
    const results = [];

    for (const op of operations || []) {
        try {
            const existing = await prisma.category.findFirst({ where: { shopId: tenant.shopId, clientId: op.clientId } });

            if (op.operationType === 'DELETE') {
                if (existing) {
                    await prisma.category.update({
                        where: { id: existing.id, shopId: tenant.shopId },
                        data: { isDeleted: true, deletedAt: new Date(), deviceId },
                    });
                }
                results.push({ clientId: op.clientId, status: 'deleted' });
                continue;
            }

            if (!existing) {
                const created = await prisma.category.create({
                    data: {
                        shopId: tenant.shopId,
                        name: op.payload.name,
                        image: op.payload.image || null,
                        clientId: op.clientId,
                        deviceId,
                    },
                });
                results.push({ clientId: op.clientId, serverId: created.id, status: 'created' });
                continue;
            }

            const conflict = !!op.baseUpdatedAt && new Date(op.baseUpdatedAt) < existing.updatedAt;
            const updated = await prisma.category.update({
                where: { id: existing.id, shopId: tenant.shopId },
                data: { name: op.payload.name, image: op.payload.image, deviceId },
            });
            results.push({ clientId: op.clientId, serverId: updated.id, status: conflict ? 'conflict' : 'updated' });
        } catch (err) {
            results.push({ clientId: op.clientId, status: 'error', error: err.message });
        }
    }

    return results;
}

async function pushProducts(tenant, deviceId, operations) {
    const results = [];

    for (const op of operations || []) {
        try {
            const existing = await prisma.product.findFirst({ where: { shopId: tenant.shopId, clientId: op.clientId } });

            if (op.operationType === 'DELETE') {
                if (existing) {
                    await prisma.product.update({
                        where: { id: existing.id, shopId: tenant.shopId },
                        data: { isDeleted: true, deletedAt: new Date(), deviceId },
                    });
                }
                results.push({ clientId: op.clientId, status: 'deleted' });
                continue;
            }

            const p = op.payload;
            // Only stock counters explicitly present are written — a metadata-only
            // edit (name/price change) must never silently zero out stock that was
            // moved through /sync/push/stock-adjustments in the meantime.
            const data = {
                shopId: tenant.shopId,
                categoryId: p.categoryId ?? null,
                name: p.name,
                image: p.image ?? null,
                stockType: p.stockType,
                sheetWidthCm: p.sheetWidthCm ?? null,
                sheetHeightCm: p.sheetHeightCm ?? null,
                sheetAreaCm2: p.sheetAreaCm2 ?? null,
                packSize: p.packSize ?? null,
                packPurchasePrice: p.packPurchasePrice ?? null,
                packSalePrice: p.packSalePrice ?? null,
                purchasePrice: p.purchasePrice,
                salePrice: p.salePrice,
                clientId: op.clientId,
                deviceId,
            };
            if (p.stockQuantity !== undefined) data.stockQuantity = p.stockQuantity;
            if (p.stockAreaCm2 !== undefined) data.stockAreaCm2 = p.stockAreaCm2;
            if (p.stockLengthCm !== undefined) data.stockLengthCm = p.stockLengthCm;
            if (p.stockPacks !== undefined) data.stockPacks = p.stockPacks;
            if (p.stockLooseUnits !== undefined) data.stockLooseUnits = p.stockLooseUnits;

            if (!existing) {
                const created = await prisma.product.create({ data });
                results.push({ clientId: op.clientId, serverId: created.id, status: 'created' });
                continue;
            }

            const conflict = !!op.baseUpdatedAt && new Date(op.baseUpdatedAt) < existing.updatedAt;
            const updated = await prisma.product.update({ where: { id: existing.id, shopId: tenant.shopId }, data });
            results.push({ clientId: op.clientId, serverId: updated.id, status: conflict ? 'conflict' : 'updated' });
        } catch (err) {
            results.push({ clientId: op.clientId, status: 'error', error: err.message });
        }
    }

    return results;
}

async function pushStockAdjustments(tenant, deviceId, operations) {
    const results = [];

    for (const op of operations || []) {
        try {
            const existingLog = await prisma.stockTransaction.findFirst({ where: { shopId: tenant.shopId, clientId: op.clientId } });
            if (existingLog) {
                results.push({ clientId: op.clientId, serverId: existingLog.id, status: 'created' });
                continue;
            }

            const p = op.payload;
            const product = await prisma.product.findFirst({ where: { id: parseInt(p.productId), shopId: tenant.shopId } });
            if (!product) {
                results.push({ clientId: op.clientId, status: 'error', error: 'Product not found for this shop' });
                continue;
            }

            const result = await prisma.$transaction(async (tx) => {
                const quantity = parseFloat(p.quantity) || 0;
                const type = p.type; // "IN" | "OUT" | "PACK_BREAK"

                if (type === 'PACK_BREAK') {
                    await tx.product.update({
                        where: { id: product.id, shopId: tenant.shopId },
                        data: {
                            stockPacks: { decrement: quantity },
                            stockLooseUnits: { increment: quantity * (product.packSize || 1) },
                        },
                    });
                } else {
                    await tx.product.update({
                        where: { id: product.id, shopId: tenant.shopId },
                        data: { stockQuantity: { [type === 'OUT' ? 'decrement' : 'increment']: quantity } },
                    });
                }

                return tx.stockTransaction.create({
                    data: {
                        shopId: tenant.shopId,
                        productId: product.id,
                        type,
                        quantity,
                        price: p.price ?? null,
                        description: p.description || 'Synced from device',
                        clientId: op.clientId,
                        deviceId,
                    },
                });
            });

            results.push({ clientId: op.clientId, serverId: result.id, status: 'created' });
        } catch (err) {
            results.push({ clientId: op.clientId, status: 'error', error: err.message });
        }
    }

    return results;
}

async function pushBills(tenant, deviceId, operations) {
    const results = [];

    for (const op of operations || []) {
        try {
            const existing = await prisma.bill.findFirst({ where: { shopId: tenant.shopId, clientId: op.clientId } });
            if (existing) {
                // Idempotent replay — this exact offline bill was already synced.
                results.push({ clientId: op.clientId, serverId: existing.id, status: 'created' });
                continue;
            }

            const b = op.payload;
            const created = await prisma.$transaction(async (tx) => {
                const customerId = b.customerId ? parseInt(b.customerId) : null;
                const remainingDue = parseFloat(b.remainingDue) || 0;

                const bill = await tx.bill.create({
                    data: {
                        shopId: tenant.shopId,
                        customerId,
                        customerName: b.customerName,
                        customerPhone: b.customerPhone || null,
                        subtotal: parseFloat(b.subtotal) || 0,
                        discount: parseFloat(b.discount) || 0,
                        totalAmount: parseFloat(b.totalAmount) || 0,
                        totalReceived: parseFloat(b.totalReceived) || 0,
                        changeDue: parseFloat(b.changeDue) || 0,
                        remainingDue,
                        status: b.status || 'PENDING',
                        clientId: op.clientId,
                        deviceId,
                    },
                });

                // Khata sale synced from an offline device — same balance
                // bookkeeping as the online POST /billing/create path.
                if (customerId && remainingDue > 0) {
                    await adjustCustomerBalance(tx, customerId, remainingDue);
                }

                for (const item of b.items || []) {
                    const productId = parseInt(item.productId);
                    const product = await tx.product.findFirst({ where: { id: productId, shopId: tenant.shopId } });
                    if (!product) throw new Error(`Product ${productId} not found for this shop`);

                    await tx.billItem.create({
                        data: {
                            billId: bill.id,
                            productId,
                            productName: item.productName || product.name,
                            stockType: item.stockType,
                            quantity: item.quantity ?? null,
                            packQuantity: item.packQuantity ?? null,
                            looseQuantity: item.looseQuantity ?? null,
                            unit: item.unit ?? null,
                            width: item.width ?? null,
                            height: item.height ?? null,
                            unitArea: item.unitArea ?? null,
                            totalArea: item.totalArea ?? null,
                            lengthCm: item.lengthCm ?? null,
                            pricePerUnit: parseFloat(item.pricePerUnit) || 0,
                            total: parseFloat(item.total) || 0,
                        },
                    });

                    const { quantityForLog } = await applyBillItemStock(tx, product, item, -1);

                    await tx.stockTransaction.create({
                        data: {
                            shopId: tenant.shopId,
                            productId,
                            type: 'OUT',
                            quantity: quantityForLog,
                            price: item.pricePerUnit,
                            description: `Sold in Bill #${bill.id} (Synced)`,
                            deviceId,
                        },
                    });
                }

                return bill;
            });

            results.push({ clientId: op.clientId, serverId: created.id, status: 'created' });
        } catch (err) {
            results.push({ clientId: op.clientId, status: 'error', error: err.message });
        }
    }

    return results;
}

async function pushCustomers(tenant, deviceId, operations) {
    const results = [];

    for (const op of operations || []) {
        try {
            const existing = await prisma.customer.findFirst({ where: { shopId: tenant.shopId, clientId: op.clientId } });

            if (op.operationType === 'DELETE') {
                if (existing) {
                    await prisma.customer.update({
                        where: { id: existing.id, shopId: tenant.shopId },
                        data: { isDeleted: true, deletedAt: new Date(), deviceId },
                    });
                }
                results.push({ clientId: op.clientId, status: 'deleted' });
                continue;
            }

            if (!existing) {
                const created = await prisma.customer.create({
                    data: {
                        shopId: tenant.shopId,
                        name: op.payload.name,
                        phone: op.payload.phone || null,
                        clientId: op.clientId,
                        deviceId,
                    },
                });
                results.push({ clientId: op.clientId, serverId: created.id, status: 'created' });
                continue;
            }

            const conflict = !!op.baseUpdatedAt && new Date(op.baseUpdatedAt) < existing.updatedAt;
            const updated = await prisma.customer.update({
                where: { id: existing.id, shopId: tenant.shopId },
                data: { name: op.payload.name, phone: op.payload.phone, deviceId },
            });
            results.push({ clientId: op.clientId, serverId: updated.id, status: conflict ? 'conflict' : 'updated' });
        } catch (err) {
            results.push({ clientId: op.clientId, status: 'error', error: err.message });
        }
    }

    return results;
}

// Append-only, like pushStockAdjustments — a khata payment made offline is
// its own ledger row, replayed idempotently by clientId, never an update.
async function pushCustomerPayments(tenant, deviceId, operations) {
    const results = [];

    for (const op of operations || []) {
        try {
            const existing = await prisma.customerPayment.findFirst({ where: { shopId: tenant.shopId, clientId: op.clientId } });
            if (existing) {
                results.push({ clientId: op.clientId, serverId: existing.id, status: 'created' });
                continue;
            }

            const p = op.payload;
            const customerId = parseInt(p.customerId);
            const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId: tenant.shopId } });
            if (!customer) {
                results.push({ clientId: op.clientId, status: 'error', error: 'Customer not found for this shop' });
                continue;
            }

            const amount = parseFloat(p.amount) || 0;
            const created = await prisma.$transaction(async (tx) => {
                const payment = await tx.customerPayment.create({
                    data: {
                        shopId: tenant.shopId,
                        customerId,
                        amount,
                        note: p.note || null,
                        clientId: op.clientId,
                        deviceId,
                    },
                });
                await adjustCustomerBalance(tx, customerId, -amount);
                return payment;
            });

            results.push({ clientId: op.clientId, serverId: created.id, status: 'created' });
        } catch (err) {
            results.push({ clientId: op.clientId, status: 'error', error: err.message });
        }
    }

    return results;
}

// ----------------------------------------------------------------------------
// Status
// ----------------------------------------------------------------------------

async function getSyncStatus(tenant, entitlement) {
    const activeDeviceCount = await prisma.device.count({ where: { shopId: tenant.shopId, isActive: true } });
    return {
        cloudEnabled: entitlement.cloudEnabled,
        maxDevices: entitlement.maxDevices,
        activeDeviceCount,
        tier: entitlement.tier,
        serverTime: new Date().toISOString(),
    };
}

module.exports = {
    registerDevice,
    pullChanges,
    pushCategories,
    pushProducts,
    pushStockAdjustments,
    pushBills,
    pushCustomers,
    pushCustomerPayments,
    getSyncStatus,
};
