"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentService = exports.PaymentService = void 0;
const database_1 = __importDefault(require("../config/database"));
const appError_1 = require("../utils/appError");
const crypto_1 = require("../utils/crypto");
const whatsapp_service_1 = require("./whatsapp.service");
const crypto_2 = __importDefault(require("crypto"));
class PaymentService {
    /**
     * Get active payment gateway configuration for a specific company
     */
    async getActiveGateway(companyId) {
        if (!companyId) {
            return { provider: 'MANUAL', options: ['ACH', 'Credit Card', 'Debit Card'] };
        }
        const integrations = await database_1.default.companyIntegration.findMany({
            where: { companyId, status: 'Active' },
        });
        const razorpay = integrations.find((i) => i.provider === 'RAZORPAY');
        if (razorpay && razorpay.accountSid) {
            return {
                provider: 'RAZORPAY',
                keyId: razorpay.accountSid,
            };
        }
        const stripe = integrations.find((i) => i.provider === 'STRIPE');
        if (stripe && stripe.accountSid) {
            return {
                provider: 'STRIPE',
                publishableKey: stripe.accountSid,
            };
        }
        const authorizeNet = integrations.find((i) => i.provider === 'AUTHORIZE_NET');
        if (authorizeNet && authorizeNet.accountSid) {
            return {
                provider: 'AUTHORIZE_NET',
                apiLoginId: authorizeNet.accountSid,
            };
        }
        return { provider: 'MANUAL', options: ['ACH', 'Credit Card', 'Debit Card'] };
    }
    /**
     * Create Razorpay Order via live Razorpay API
     */
    async createRazorpayOrder(amount, currency = 'USD', companyId) {
        let keyId = process.env.RAZORPAY_KEY_ID || '';
        let keySecret = process.env.RAZORPAY_KEY_SECRET || '';
        if (companyId) {
            const integration = await database_1.default.companyIntegration.findFirst({
                where: { companyId, provider: 'RAZORPAY', status: 'Active' },
            });
            if (integration && integration.accountSid && integration.encryptedAuthToken && integration.encryptionIv) {
                keyId = integration.accountSid;
                try {
                    keySecret = (0, crypto_1.decrypt)(integration.encryptedAuthToken, integration.encryptionIv);
                }
                catch (e) {
                    console.error('Failed to decrypt Razorpay Key Secret', e);
                }
            }
        }
        if (!keyId || !keySecret) {
            throw new appError_1.AppError('Razorpay credentials not configured for this company.', 400, 'GATEWAY_ERROR');
        }
        const amountInPaise = Math.round(amount * 100);
        const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const res = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${authHeader}`,
            },
            body: JSON.stringify({
                amount: amountInPaise,
                currency: currency === 'INR' ? 'INR' : 'USD',
                receipt: `rcpt_${Date.now()}`,
            }),
        });
        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            throw new appError_1.AppError(errorBody.error?.description || 'Failed to create Razorpay Order', 400, 'RAZORPAY_ORDER_FAILED');
        }
        const order = await res.json();
        return {
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId,
        };
    }
    /**
     * Verify Razorpay Payment Signature and process DB payment
     */
    async verifyRazorpayPayment(data) {
        let keySecret = process.env.RAZORPAY_KEY_SECRET || '';
        if (data.companyId) {
            const integration = await database_1.default.companyIntegration.findFirst({
                where: { companyId: data.companyId, provider: 'RAZORPAY', status: 'Active' },
            });
            if (integration && integration.encryptedAuthToken && integration.encryptionIv) {
                try {
                    keySecret = (0, crypto_1.decrypt)(integration.encryptedAuthToken, integration.encryptionIv);
                }
                catch (e) {
                    console.error('Failed to decrypt Razorpay Key Secret for verification', e);
                }
            }
        }
        if (keySecret) {
            const expectedSignature = crypto_2.default
                .createHmac('sha256', keySecret)
                .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
                .digest('hex');
            if (expectedSignature !== data.razorpaySignature) {
                throw new appError_1.AppError('Invalid Razorpay signature. Transaction failed.', 400, 'SIGNATURE_INVALID');
            }
        }
        return this.processPayment({
            amount: data.amount,
            paymentMethod: 'Razorpay',
            referenceNumber: data.razorpayPaymentId,
            companyId: data.companyId,
            userEmail: data.userEmail,
            userRole: data.userRole,
        });
    }
    async getAllPayments(companyId, user) {
        let whereClause = companyId ? { companyId } : {};
        const userRole = user?.roleName || user?.role;
        if (userRole === 'Tenant' && user?.email) {
            const tenant = await database_1.default.tenant.findFirst({
                where: { email: user.email },
            });
            if (tenant) {
                whereClause = { tenantId: tenant.id };
            }
            else {
                return [];
            }
        }
        return database_1.default.rentPayment.findMany({
            where: whereClause,
            include: {
                tenant: true,
                property: true,
                unit: true,
                lease: true,
            },
        });
    }
    async processPayment(data) {
        let tenantId = data.tenantId;
        let propertyId = data.propertyId;
        let unitId = data.unitId;
        let leaseId = data.leaseId;
        // 1. Verify tenant exists or find first tenant
        let tenant = null;
        if (data.userRole === 'Tenant' && data.userEmail) {
            tenant = await database_1.default.tenant.findFirst({
                where: { email: data.userEmail },
            });
        }
        if (tenant) {
            tenantId = tenant.id;
        }
        else if (tenantId) {
            tenant = await database_1.default.tenant.findUnique({ where: { id: tenantId } });
        }
        if (!tenant && !tenantId) {
            tenant = await database_1.default.tenant.findFirst({ where: data.companyId ? { companyId: data.companyId } : {} });
        }
        if (tenant) {
            tenantId = tenant.id;
            if (!unitId && tenant.unitId) {
                unitId = tenant.unitId;
            }
        }
        // 2. Look for existing lease for tenant or unit
        if (tenantId) {
            const lease = await database_1.default.lease.findFirst({
                where: { tenantId },
                orderBy: { startDate: 'desc' },
            });
            if (lease) {
                leaseId = lease.id;
                propertyId = lease.propertyId;
                unitId = lease.unitId;
            }
        }
        if (!leaseId && unitId) {
            const unitLease = await database_1.default.lease.findFirst({
                where: { unitId },
                orderBy: { startDate: 'desc' },
            });
            if (unitLease) {
                leaseId = unitLease.id;
                propertyId = unitLease.propertyId;
                if (!tenantId)
                    tenantId = unitLease.tenantId;
            }
        }
        // 3. Ensure unitId points to a REAL Unit record
        let unit = unitId ? await database_1.default.unit.findUnique({ where: { id: unitId } }) : null;
        if (!unit && propertyId) {
            unit = await database_1.default.unit.findFirst({ where: { propertyId } });
        }
        if (!unit) {
            unit = await database_1.default.unit.findFirst();
        }
        if (unit) {
            unitId = unit.id;
            if (!propertyId)
                propertyId = unit.propertyId;
        }
        // 4. Ensure propertyId points to a REAL Property record
        let property = propertyId ? await database_1.default.property.findUnique({ where: { id: propertyId } }) : null;
        if (!property && unit?.propertyId) {
            property = await database_1.default.property.findUnique({ where: { id: unit.propertyId } });
        }
        if (!property) {
            property = await database_1.default.property.findFirst({ where: data.companyId ? { companyId: data.companyId } : {} });
        }
        if (property) {
            propertyId = property.id;
        }
        // 5. If still no lease, create a valid lease with guaranteed existing foreign keys
        if (!leaseId && tenantId && propertyId && unitId) {
            const existingLease = await database_1.default.lease.findFirst({
                where: { tenantId, propertyId, unitId }
            });
            if (existingLease) {
                leaseId = existingLease.id;
            }
            else {
                const dummyLease = await database_1.default.lease.create({
                    data: {
                        tenantId,
                        propertyId,
                        unitId,
                        startDate: new Date(),
                        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                        rentAmount: Number(data.amount) || 1000,
                        depositAmount: 1000,
                        status: 'Active',
                        companyId: data.companyId || tenant?.companyId || property?.companyId,
                    },
                });
                leaseId = dummyLease.id;
            }
        }
        if (!leaseId || !propertyId || !unitId || !tenantId) {
            throw new Error('Cannot process payment: Valid Tenant, Property, Unit, and Lease are required.');
        }
        const refNum = data.referenceNumber || `REF-${Date.now()}`;
        return database_1.default.$transaction(async (tx) => {
            const existingPayment = await tx.rentPayment.findFirst({
                where: { referenceNumber: refNum },
            });
            if (existingPayment) {
                throw new appError_1.AppError(`A payment with reference number "${refNum}" has already been processed.`, 400, 'DUPLICATE_PAYMENT');
            }
            const payment = await tx.rentPayment.create({
                data: {
                    tenantId: tenantId,
                    propertyId: propertyId,
                    unitId: unitId,
                    leaseId: leaseId,
                    amount: Number(data.amount),
                    dueDate: new Date(data.dueDate || Date.now()),
                    paidDate: new Date(data.paidDate || Date.now()),
                    status: 'Paid',
                    paymentMethod: data.paymentMethod || 'ACH',
                    referenceNumber: refNum,
                    companyId: data.companyId || tenant?.companyId || property?.companyId,
                },
                include: {
                    tenant: true,
                    property: true,
                    unit: true,
                    company: true,
                }
            });
            // Create real notifications for Property Manager and Tenant
            const tenantNameStr = tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Resident';
            const unitNumStr = unit ? unit.unitNumber : '';
            await tx.notification.create({
                data: {
                    title: 'Payment Received',
                    message: `Payment of $${payment.amount.toLocaleString()} received from ${tenantNameStr}`,
                    type: 'success',
                    role: 'Property Manager',
                    companyId: payment.companyId,
                    targetId: payment.id,
                },
            });
            await tx.notification.create({
                data: {
                    title: 'Payment Receipt Confirmed',
                    message: `Your payment of $${payment.amount.toLocaleString()} ${unitNumStr ? `for Unit ${unitNumStr}` : ''} has been processed.`,
                    type: 'success',
                    role: 'Tenant',
                    companyId: payment.companyId,
                    targetId: payment.id,
                },
            });
            // Dispatch live Meta WhatsApp message if tenant phone is registered
            if (tenant?.phone && payment.companyId) {
                whatsapp_service_1.whatsappService.sendWhatsAppMessage({
                    companyId: payment.companyId,
                    to: tenant.phone,
                    message: `Hello ${tenant.firstName}, your payment of $${payment.amount.toLocaleString()} has been received and processed. Reference ID: ${payment.referenceNumber}. Thank you!`,
                }).catch((err) => console.error('WhatsApp dispatch warning:', err));
            }
            const unpaidInvoices = await tx.invoice.findMany({
                where: { tenantId, status: { in: ['Sent', 'Overdue', 'Partially Paid', 'Unpaid', 'Draft'] } },
                orderBy: { dueDate: 'asc' },
            });
            let remainingAmount = Number(data.amount);
            for (const invoice of unpaidInvoices) {
                if (remainingAmount <= 0)
                    break;
                const currentBalance = invoice.balance || 0;
                if (remainingAmount >= currentBalance) {
                    await tx.invoice.update({
                        where: { id: invoice.id },
                        data: {
                            paidAmount: { increment: currentBalance },
                            balance: 0,
                            status: 'Paid',
                        },
                    });
                    remainingAmount -= currentBalance;
                }
                else {
                    await tx.invoice.update({
                        where: { id: invoice.id },
                        data: {
                            paidAmount: { increment: remainingAmount },
                            balance: { decrement: remainingAmount },
                            status: 'Partially Paid',
                        },
                    });
                    remainingAmount = 0;
                }
            }
            // Update Checking Account (Asset)
            const checkingAccount = await tx.coAAccount.findFirst({
                where: data.companyId
                    ? { companyId: data.companyId, OR: [{ accountCode: '1010' }, { type: 'Asset' }] }
                    : { OR: [{ accountCode: '1010' }, { type: 'Asset' }] }
            });
            if (checkingAccount) {
                await tx.coAAccount.update({
                    where: { id: checkingAccount.id },
                    data: { balance: { increment: payment.amount } }
                });
            }
            // Update Rental Income Account (Revenue)
            const incomeAccount = await tx.coAAccount.findFirst({
                where: data.companyId
                    ? { companyId: data.companyId, OR: [{ accountCode: '4010' }, { type: 'Revenue' }] }
                    : { OR: [{ accountCode: '4010' }, { type: 'Revenue' }] }
            });
            if (incomeAccount) {
                await tx.coAAccount.update({
                    where: { id: incomeAccount.id },
                    data: { balance: { increment: payment.amount } }
                });
            }
            return payment;
        });
    }
    async getPaymentById(id, companyId) {
        const whereClause = { id };
        if (companyId)
            whereClause.companyId = companyId;
        const payment = await database_1.default.rentPayment.findFirst({
            where: whereClause,
            include: {
                tenant: true,
                property: true,
                unit: true,
                lease: true,
            },
        });
        if (!payment) {
            throw new appError_1.AppError('Payment record not found.', 404, 'NOT_FOUND');
        }
        return payment;
    }
    async updatePayment(id, data, companyId) {
        const whereClause = { id };
        if (companyId)
            whereClause.companyId = companyId;
        const existingPayment = await database_1.default.rentPayment.findFirst({
            where: whereClause,
        });
        if (!existingPayment) {
            throw new appError_1.AppError('Payment record not found.', 404, 'NOT_FOUND');
        }
        const updateData = {};
        if (data.amount !== undefined)
            updateData.amount = Number(data.amount);
        if (data.paidDate !== undefined)
            updateData.paidDate = new Date(data.paidDate);
        if (data.dueDate !== undefined)
            updateData.dueDate = new Date(data.dueDate);
        if (data.paymentMethod !== undefined)
            updateData.paymentMethod = data.paymentMethod;
        if (data.referenceNumber !== undefined)
            updateData.referenceNumber = data.referenceNumber;
        if (data.status !== undefined)
            updateData.status = data.status;
        return database_1.default.$transaction(async (tx) => {
            if (data.amount !== undefined && Number(data.amount) !== existingPayment.amount) {
                const diff = Number(data.amount) - existingPayment.amount;
                const checkingAccount = await tx.coAAccount.findFirst({
                    where: companyId
                        ? { companyId, OR: [{ accountCode: '1010' }, { type: 'Asset' }] }
                        : { OR: [{ accountCode: '1010' }, { type: 'Asset' }] },
                });
                if (checkingAccount) {
                    await tx.coAAccount.update({
                        where: { id: checkingAccount.id },
                        data: { balance: { increment: diff } },
                    });
                }
                const incomeAccount = await tx.coAAccount.findFirst({
                    where: companyId
                        ? { companyId, OR: [{ accountCode: '4010' }, { type: 'Revenue' }] }
                        : { OR: [{ accountCode: '4010' }, { type: 'Revenue' }] },
                });
                if (incomeAccount) {
                    await tx.coAAccount.update({
                        where: { id: incomeAccount.id },
                        data: { balance: { increment: diff } },
                    });
                }
            }
            return tx.rentPayment.update({
                where: { id },
                data: updateData,
                include: {
                    tenant: true,
                    property: true,
                    unit: true,
                    lease: true,
                },
            });
        });
    }
    async deletePayment(id, companyId) {
        const whereClause = { id };
        if (companyId)
            whereClause.companyId = companyId;
        const payment = await database_1.default.rentPayment.findFirst({
            where: whereClause,
        });
        if (!payment) {
            throw new appError_1.AppError('Payment record not found.', 404, 'NOT_FOUND');
        }
        return database_1.default.$transaction(async (tx) => {
            const tenantInvoices = await tx.invoice.findMany({
                where: { tenantId: payment.tenantId },
                orderBy: { dueDate: 'desc' },
            });
            let amountToRevert = payment.amount;
            for (const invoice of tenantInvoices) {
                if (amountToRevert <= 0)
                    break;
                if (invoice.paidAmount > 0) {
                    const revertFromInvoice = Math.min(amountToRevert, invoice.paidAmount);
                    const newPaidAmount = invoice.paidAmount - revertFromInvoice;
                    const newBalance = invoice.balance + revertFromInvoice;
                    const newStatus = newPaidAmount === 0 ? 'Unpaid' : 'Partially Paid';
                    await tx.invoice.update({
                        where: { id: invoice.id },
                        data: {
                            paidAmount: newPaidAmount,
                            balance: newBalance,
                            status: newStatus,
                        },
                    });
                    amountToRevert -= revertFromInvoice;
                }
            }
            const checkingAccount = await tx.coAAccount.findFirst({
                where: companyId
                    ? { companyId, OR: [{ accountCode: '1010' }, { type: 'Asset' }] }
                    : { OR: [{ accountCode: '1010' }, { type: 'Asset' }] },
            });
            if (checkingAccount) {
                await tx.coAAccount.update({
                    where: { id: checkingAccount.id },
                    data: { balance: { decrement: payment.amount } },
                });
            }
            const incomeAccount = await tx.coAAccount.findFirst({
                where: companyId
                    ? { companyId, OR: [{ accountCode: '4010' }, { type: 'Revenue' }] }
                    : { OR: [{ accountCode: '4010' }, { type: 'Revenue' }] },
            });
            if (incomeAccount) {
                await tx.coAAccount.update({
                    where: { id: incomeAccount.id },
                    data: { balance: { decrement: payment.amount } },
                });
            }
            await tx.rentPayment.delete({
                where: { id: payment.id },
            });
            return { message: 'Payment deleted successfully.' };
        });
    }
}
exports.PaymentService = PaymentService;
exports.paymentService = new PaymentService();
