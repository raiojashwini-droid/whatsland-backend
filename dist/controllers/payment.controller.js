"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentController = exports.PaymentController = void 0;
const payment_service_1 = require("../services/payment.service");
const apiResponse_1 = require("../utils/apiResponse");
const appError_1 = require("../utils/appError");
const database_1 = __importDefault(require("../config/database"));
class PaymentController {
    async getAll(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const payments = await payment_service_1.paymentService.getAllPayments(companyId, req.user);
            return (0, apiResponse_1.sendSuccess)({ res, data: payments });
        }
        catch (error) {
            next(error);
        }
    }
    async processPayment(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const { tenantId, propertyId, unitId, leaseId, invoiceId } = req.body;
            if (companyId) {
                if (tenantId) {
                    const tenant = await database_1.default.tenant.findFirst({ where: { id: tenantId, companyId } });
                    if (!tenant)
                        throw new appError_1.AppError('Tenant not found.', 404, 'NOT_FOUND');
                }
                if (propertyId) {
                    const prop = await database_1.default.property.findFirst({ where: { id: propertyId, companyId } });
                    if (!prop)
                        throw new appError_1.AppError('Property not found.', 404, 'NOT_FOUND');
                }
                if (unitId) {
                    const unit = await database_1.default.unit.findFirst({ where: { id: unitId, property: { companyId } } });
                    if (!unit)
                        throw new appError_1.AppError('Unit not found.', 404, 'NOT_FOUND');
                }
                if (leaseId) {
                    const lease = await database_1.default.lease.findFirst({ where: { id: leaseId, companyId } });
                    if (!lease)
                        throw new appError_1.AppError('Lease not found.', 404, 'NOT_FOUND');
                }
                if (invoiceId) {
                    const invoice = await database_1.default.invoice.findFirst({ where: { id: invoiceId, companyId } });
                    if (!invoice)
                        throw new appError_1.AppError('Invoice not found.', 404, 'NOT_FOUND');
                }
            }
            const payment = await payment_service_1.paymentService.processPayment({
                ...req.body,
                companyId,
                userEmail: req.user?.email,
                userRole: req.user?.roleName || req.user?.role,
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: payment });
        }
        catch (error) {
            next(error);
        }
    }
    async getById(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const id = req.params.id;
            const payment = await payment_service_1.paymentService.getPaymentById(id, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: payment });
        }
        catch (error) {
            next(error);
        }
    }
    async updatePayment(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const id = req.params.id;
            const updatedPayment = await payment_service_1.paymentService.updatePayment(id, req.body, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: updatedPayment });
        }
        catch (error) {
            next(error);
        }
    }
    async getActiveGateway(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const gateway = await payment_service_1.paymentService.getActiveGateway(companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: gateway });
        }
        catch (error) {
            next(error);
        }
    }
    async createRazorpayOrder(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const { amount, currency } = req.body;
            const order = await payment_service_1.paymentService.createRazorpayOrder(Number(amount), currency || 'USD', companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: order });
        }
        catch (error) {
            next(error);
        }
    }
    async verifyRazorpayPayment(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const { razorpayOrderId, razorpayPaymentId, razorpaySignature, amount } = req.body;
            const result = await payment_service_1.paymentService.verifyRazorpayPayment({
                razorpayOrderId,
                razorpayPaymentId,
                razorpaySignature,
                amount: Number(amount),
                companyId,
                userEmail: req.user?.email,
                userRole: req.user?.roleName || req.user?.role,
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: result });
        }
        catch (error) {
            next(error);
        }
    }
    async deletePayment(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const id = req.params.id;
            const result = await payment_service_1.paymentService.deletePayment(id, companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: result });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.PaymentController = PaymentController;
exports.paymentController = new PaymentController();
