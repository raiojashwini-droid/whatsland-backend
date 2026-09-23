"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceController = void 0;
const database_1 = __importDefault(require("../config/database"));
const apiResponse_1 = require("../utils/apiResponse");
const billingAutomation_service_1 = require("../services/billingAutomation.service");
class InvoiceController {
    async getAll(req, res, next) {
        try {
            // Auto-generate rent invoices & late fees (catch-up)
            await (0, billingAutomation_service_1.generateAutoInvoices)();
            await (0, billingAutomation_service_1.generateAutoLateFees)();
            const companyId = req.user?.companyId;
            const userRole = req.user?.roleName || req.user?.role;
            const userEmail = req.user?.email;
            let whereClause = companyId ? { companyId } : {};
            if (userRole === 'Tenant' && userEmail) {
                const tenant = await database_1.default.tenant.findFirst({
                    where: { email: userEmail },
                });
                if (tenant) {
                    whereClause = { tenantId: tenant.id };
                }
                else {
                    return (0, apiResponse_1.sendSuccess)({ res, data: [] });
                }
            }
            let invoices = await database_1.default.invoice.findMany({
                where: whereClause,
                include: {
                    tenant: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            const formatted = invoices.map((inv) => ({
                ...inv,
                dueDate: inv.dueDate || '',
                lineItems: (() => {
                    try {
                        return JSON.parse(inv.lineItems);
                    }
                    catch {
                        return [];
                    }
                })(),
            }));
            return (0, apiResponse_1.sendSuccess)({ res, data: formatted });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const { tenantId, tenantName, propertyId, propertyName, unitNumber, dueDate, amount, paidAmount, balance, status, lineItems, notes, } = req.body;
            const companyId = req.user?.companyId;
            const parsedDueDate = dueDate ? new Date(dueDate) : new Date();
            const invoice = await database_1.default.invoice.create({
                data: {
                    tenantId: tenantId || 'default',
                    tenantName: tenantName || 'Unknown Tenant',
                    propertyId: propertyId || 'default',
                    propertyName: propertyName || 'Unknown Property',
                    unitNumber: unitNumber || '',
                    dueDate: typeof dueDate === 'string' ? dueDate : (isNaN(parsedDueDate.getTime()) ? new Date().toISOString().split('T')[0] : parsedDueDate.toISOString().split('T')[0]),
                    amount: parseFloat(amount) || 0,
                    paidAmount: parseFloat(paidAmount) || 0,
                    balance: parseFloat(balance ?? amount) || 0,
                    status: status || 'Draft',
                    lineItems: JSON.stringify(lineItems || []),
                    notes: notes || null,
                    companyId,
                },
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                statusCode: 201,
                data: { ...invoice, lineItems: lineItems || [] },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const id = req.params.id;
            const { status, paidAmount, balance, notes } = req.body;
            const companyId = req.user?.companyId;
            if (companyId) {
                const check = await database_1.default.invoice.findFirst({
                    where: { id, companyId },
                });
                if (!check)
                    throw new Error('Invoice not found.');
            }
            const invoice = await database_1.default.invoice.update({
                where: { id },
                data: {
                    ...(status && { status }),
                    ...(paidAmount !== undefined && { paidAmount: parseFloat(paidAmount) }),
                    ...(balance !== undefined && { balance: parseFloat(balance) }),
                    ...(notes !== undefined && { notes }),
                },
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    ...invoice,
                    lineItems: (() => {
                        try {
                            return JSON.parse(invoice.lineItems);
                        }
                        catch {
                            return [];
                        }
                    })(),
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async remove(req, res, next) {
        try {
            const id = req.params.id;
            const companyId = req.user?.companyId;
            if (companyId) {
                const check = await database_1.default.invoice.findFirst({
                    where: { id, companyId },
                });
                if (!check)
                    throw new Error('Invoice not found.');
            }
            await database_1.default.invoice.delete({ where: { id } });
            return (0, apiResponse_1.sendSuccess)({ res, data: { deleted: true } });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.invoiceController = new InvoiceController();
