const prisma = require('../prisma/client');
const { normalizeStockType } = require('../utils/stockType');
const { applyBillItemStock } = require('../services/billStockService');
const { adjustCustomerBalance } = require('../services/customerService');
const { normalizePaymentMethod } = require('../utils/paymentMethod');

// Create a new Bill
exports.createBill = async (req, res) => {
    const { customerName, customerPhone, customerId, subtotal, discount, totalAmount, totalReceived, changeDue, remainingDue, paymentMethod, items, status } = req.body;
    const shopId = req.tenant.shopId;

    try {
        const result = await prisma.$transaction(async (tx) => {
            const parsedCustomerId = customerId ? parseInt(customerId) : null;
            const parsedRemainingDue = parseFloat(remainingDue) || 0;

            const bill = await tx.bill.create({
                data: {
                    shopId,
                    customerName,
                    customerPhone,
                    customerId: parsedCustomerId,
                    subtotal: parseFloat(subtotal) || 0,
                    discount: parseFloat(discount) || 0,
                    totalAmount: parseFloat(totalAmount) || 0,
                    totalReceived: parseFloat(totalReceived) || 0,
                    changeDue: parseFloat(changeDue) || 0,
                    remainingDue: parsedRemainingDue,
                    paymentMethod: normalizePaymentMethod(paymentMethod),
                    status: (status || 'pending').toUpperCase(),
                },
            });

            // Khata sale — the unpaid portion is added to the customer's running balance.
            if (parsedCustomerId && parsedRemainingDue > 0) {
                await adjustCustomerBalance(tx, parsedCustomerId, parsedRemainingDue);
            }

            const billItems = [];
            for (const item of items) {
                const productId = parseInt(item.productId);
                if (isNaN(productId)) {
                    throw new Error(`Invalid or missing productId for item: ${item.productName || 'Unknown'}`);
                }

                const product = await tx.product.findFirst({ where: { id: productId, shopId } });
                if (!product) throw new Error(`Product with ID ${productId} not found`);

                const stockType = normalizeStockType(item.stockType);
                const quantity = parseFloat(item.quantity) || 0;
                const pricePerUnit = parseFloat(item.pricePerUnit) || 0;
                const total = parseFloat(item.total) || quantity * pricePerUnit;

                const billItem = await tx.billItem.create({
                    data: {
                        billId: bill.id,
                        productId,
                        productName: item.productName || product.name,
                        stockType,
                        quantity,
                        packQuantity: parseFloat(item.packQuantity) || null,
                        looseQuantity: parseFloat(item.looseQuantity) || null,
                        unit: item.unit || null,
                        width: parseFloat(item.width) || null,
                        height: parseFloat(item.height) || null,
                        unitArea: parseFloat(item.unitArea) || null,
                        totalArea: parseFloat(item.totalArea) || null,
                        lengthCm: parseFloat(item.lengthCm) || null,
                        pricePerUnit,
                        total,
                    },
                });
                billItems.push(billItem);

                const { quantityForLog } = await applyBillItemStock(tx, product, { ...item, stockType }, -1);

                await tx.stockTransaction.create({
                    data: {
                        shopId,
                        productId,
                        type: 'OUT',
                        quantity: quantityForLog,
                        price: pricePerUnit,
                        description: `Sold in Bill #${bill.id}`,
                    },
                });
            }

            return { bill, billItems };
        });

        res.status(201).json({ message: 'Bill generated successfully', ...result });
    } catch (err) {
        console.error('Create Bill Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Get all bills for a shop (paginated)
exports.getBills = async (req, res) => {
    try {
        const { status = 'all', startDate, endDate } = req.query;
        const shopId = req.tenant.shopId;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const where = { shopId, isDeleted: false };

        if (status !== 'all') {
            where.status = status.toUpperCase();
        }

        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate + 'T00:00:00.000Z'),
                lte: new Date(endDate + 'T23:59:59.999Z'),
            };
        }

        const bills = await prisma.bill.findMany({
            where,
            include: { _count: { select: { items: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        });

        const total = await prisma.bill.count({ where });
        const hasMore = skip + limit < total;

        res.json({ success: true, bills, total, page, limit, hasMore });
    } catch (err) {
        console.error('Get Bills Error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

// Get single bill with items (ownership resolved by middleware.tenantContext.byResourceId)
exports.getBillById = async (req, res) => {
    try {
        const bill = await prisma.bill.findFirst({
            where: { id: parseInt(req.params.id), shopId: req.tenant.shopId },
            include: {
                items: { include: { product: true } },
                shop: true,
            },
        });

        if (!bill) return res.status(404).json({ message: 'Bill not found' });
        res.json(bill);
    } catch (err) {
        console.error('Get Bill Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Update an existing Bill — reverts old items' stock, then reapplies the new set.
exports.updateBill = async (req, res) => {
    const billId = parseInt(req.params.id);
    const shopId = req.tenant.shopId;
    const { customerName, customerPhone, subtotal, discount, totalAmount, totalReceived, changeDue, remainingDue, items, status, NewRecivedPyament } = req.body;

    try {
        const result = await prisma.$transaction(async (tx) => {
            const existingBill = await tx.bill.findFirst({
                where: { id: billId, shopId },
                include: { items: true },
            });

            if (!existingBill) {
                throw new Error('Bill not found');
            }

            // Revert old items' stock
            for (const oldItem of existingBill.items) {
                const product = await tx.product.findFirst({ where: { id: oldItem.productId, shopId } });
                if (!product) continue;

                const { quantityForLog } = await applyBillItemStock(tx, product, oldItem, +1);

                await tx.stockTransaction.create({
                    data: {
                        shopId,
                        productId: oldItem.productId,
                        type: 'IN',
                        quantity: quantityForLog,
                        price: oldItem.pricePerUnit,
                        description: `Reverted for Bill Update #${existingBill.id}`,
                    },
                });
            }

            await tx.billItem.deleteMany({ where: { billId: existingBill.id } });

            let finalTotalReceived = parseFloat(totalReceived) || 0;
            let finalRemainingDue = parseFloat(remainingDue) || 0;

            if (NewRecivedPyament) {
                const addedPayment = parseFloat(NewRecivedPyament) || 0;
                finalTotalReceived += addedPayment;
                finalRemainingDue -= addedPayment;

                // Paying down a khata bill reduces the customer's running balance.
                if (existingBill.customerId) {
                    await adjustCustomerBalance(tx, existingBill.customerId, -addedPayment);
                }
            }

            const updatedBill = await tx.bill.update({
                where: { id: existingBill.id, shopId },
                data: {
                    customerName,
                    customerPhone,
                    subtotal: parseFloat(subtotal) || 0,
                    discount: parseFloat(discount) || 0,
                    totalAmount: parseFloat(totalAmount) || 0,
                    totalReceived: finalTotalReceived,
                    changeDue: parseFloat(changeDue) || 0,
                    remainingDue: finalRemainingDue,
                    status: (status || 'pending').toUpperCase(),
                },
            });

            const newBillItems = [];
            for (const item of items) {
                const productId = parseInt(item.productId);
                if (isNaN(productId)) {
                    throw new Error(`Invalid or missing productId for item: ${item.productName || 'Unknown'}`);
                }

                const product = await tx.product.findFirst({ where: { id: productId, shopId } });
                if (!product) throw new Error(`Product with ID ${productId} not found`);

                const stockType = normalizeStockType(item.stockType);
                const quantity = parseFloat(item.quantity) || 0;
                const pricePerUnit = parseFloat(item.pricePerUnit) || 0;
                const total = parseFloat(item.total) || quantity * pricePerUnit;

                const billItem = await tx.billItem.create({
                    data: {
                        billId: updatedBill.id,
                        productId,
                        productName: item.productName || product.name,
                        stockType,
                        quantity,
                        packQuantity: parseFloat(item.packQuantity) || null,
                        looseQuantity: parseFloat(item.looseQuantity) || null,
                        unit: item.unit || null,
                        width: parseFloat(item.width) || null,
                        height: parseFloat(item.height) || null,
                        unitArea: parseFloat(item.unitArea) || null,
                        totalArea: parseFloat(item.totalArea) || null,
                        lengthCm: parseFloat(item.lengthCm) || null,
                        pricePerUnit,
                        total,
                    },
                });
                newBillItems.push(billItem);

                const { quantityForLog } = await applyBillItemStock(tx, product, { ...item, stockType }, -1);

                await tx.stockTransaction.create({
                    data: {
                        shopId,
                        productId,
                        type: 'OUT',
                        quantity: quantityForLog,
                        price: pricePerUnit,
                        description: `Sold in Updated Bill #${updatedBill.id}`,
                    },
                });
            }

            return { bill: updatedBill, billItems: newBillItems };
        });

        res.status(200).json({ message: 'Bill updated successfully', ...result });
    } catch (err) {
        console.error('Update Bill Error:', err);
        res.status(500).json({ error: err.message });
    }
};
