"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.superAdminController = exports.SuperAdminController = void 0;
const superadmin_service_1 = require("../services/superadmin.service");
const apiResponse_1 = require("../utils/apiResponse");
const database_1 = __importDefault(require("../config/database"));
class SuperAdminController {
    // Companies
    async getCompanies(req, res, next) {
        try {
            const list = await superadmin_service_1.superAdminService.getCompanies();
            return (0, apiResponse_1.sendSuccess)({ res, data: list });
        }
        catch (error) {
            next(error);
        }
    }
    async getCompanyById(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const company = await superadmin_service_1.superAdminService.getCompanyById(id);
            return (0, apiResponse_1.sendSuccess)({ res, data: company });
        }
        catch (error) {
            next(error);
        }
    }
    async createCompany(req, res, next) {
        try {
            const company = await superadmin_service_1.superAdminService.createCompany({ ...req.body, isSuperadmin: true });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: company });
        }
        catch (error) {
            next(error);
        }
    }
    async updateCompany(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const company = await superadmin_service_1.superAdminService.updateCompany(id, req.body);
            return (0, apiResponse_1.sendSuccess)({ res, data: company });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteCompany(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            await superadmin_service_1.superAdminService.deleteCompany(id);
            return (0, apiResponse_1.sendSuccess)({ res, message: 'Company deleted successfully' });
        }
        catch (error) {
            next(error);
        }
    }
    // Company Users
    async getCompanyUsers(req, res, next) {
        try {
            let companyId = req.user?.roleName === 'Super Admin' ? undefined : req.user?.companyId;
            if (companyId === undefined && !req.user?.companyId && req.user?.email && req.user?.roleName !== 'Super Admin') {
                const dbUser = await database_1.default.user.findFirst({
                    where: { email: req.user.email },
                });
                companyId = dbUser?.companyId || undefined;
            }
            console.log('DEBUG: getCompanyUsers - req.user:', req.user, 'companyId:', companyId);
            const list = await superadmin_service_1.superAdminService.getCompanyUsers(companyId);
            return (0, apiResponse_1.sendSuccess)({ res, data: list });
        }
        catch (error) {
            next(error);
        }
    }
    async createCompanyUser(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const user = await superadmin_service_1.superAdminService.createCompanyUser({
                ...req.body,
                companyId: req.body.companyId || companyId,
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: user });
        }
        catch (error) {
            next(error);
        }
    }
    async updateCompanyUserStatus(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const user = await superadmin_service_1.superAdminService.updateCompanyUserStatus(id, req.body.status);
            return (0, apiResponse_1.sendSuccess)({ res, data: user });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteCompanyUser(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            await superadmin_service_1.superAdminService.deleteCompanyUser(id);
            return (0, apiResponse_1.sendSuccess)({ res, message: 'User deleted successfully' });
        }
        catch (error) {
            next(error);
        }
    }
    // Plans
    async getPlans(req, res, next) {
        try {
            const list = await superadmin_service_1.superAdminService.getPlans();
            return (0, apiResponse_1.sendSuccess)({ res, data: list });
        }
        catch (error) {
            next(error);
        }
    }
    async createPlan(req, res, next) {
        try {
            const plan = await superadmin_service_1.superAdminService.createPlan(req.body);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: plan });
        }
        catch (error) {
            next(error);
        }
    }
    async updatePlan(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const plan = await superadmin_service_1.superAdminService.updatePlan(id, req.body);
            return (0, apiResponse_1.sendSuccess)({ res, data: plan });
        }
        catch (error) {
            next(error);
        }
    }
    async deletePlan(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            await superadmin_service_1.superAdminService.deletePlan(id);
            return (0, apiResponse_1.sendSuccess)({ res, message: 'Plan deleted successfully' });
        }
        catch (error) {
            next(error);
        }
    }
    // Invoices
    async getInvoices(req, res, next) {
        try {
            const list = await superadmin_service_1.superAdminService.getInvoices();
            return (0, apiResponse_1.sendSuccess)({ res, data: list });
        }
        catch (error) {
            next(error);
        }
    }
    async createInvoice(req, res, next) {
        try {
            const invoice = await superadmin_service_1.superAdminService.createInvoice(req.body);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: invoice });
        }
        catch (error) {
            next(error);
        }
    }
    async processSubscriptionPayment(req, res, next) {
        try {
            const result = await superadmin_service_1.superAdminService.processSubscriptionPayment(req.body);
            return (0, apiResponse_1.sendSuccess)({ res, data: result });
        }
        catch (error) {
            next(error);
        }
    }
    async updateInvoiceStatus(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const invoice = await superadmin_service_1.superAdminService.updateInvoiceStatus(id, req.body.status);
            return (0, apiResponse_1.sendSuccess)({ res, data: invoice });
        }
        catch (error) {
            next(error);
        }
    }
    // Stats
    async getStats(req, res, next) {
        try {
            const stats = await superadmin_service_1.superAdminService.getStats();
            return (0, apiResponse_1.sendSuccess)({ res, data: stats });
        }
        catch (error) {
            next(error);
        }
    }
    // Settings
    async getSettings(req, res, next) {
        try {
            const settings = await superadmin_service_1.superAdminService.getPlatformSettings();
            return (0, apiResponse_1.sendSuccess)({ res, data: settings });
        }
        catch (error) {
            next(error);
        }
    }
    async updateSettings(req, res, next) {
        try {
            const settings = await superadmin_service_1.superAdminService.updatePlatformSettings(req.body);
            return (0, apiResponse_1.sendSuccess)({ res, data: settings });
        }
        catch (error) {
            next(error);
        }
    }
    // Audit Logs
    async getAuditLogs(req, res, next) {
        try {
            const logs = await superadmin_service_1.superAdminService.getAuditLogs();
            return (0, apiResponse_1.sendSuccess)({ res, data: logs });
        }
        catch (error) {
            next(error);
        }
    }
    async createAuditLog(req, res, next) {
        try {
            const log = await superadmin_service_1.superAdminService.createAuditLog(req.body);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: log });
        }
        catch (error) {
            next(error);
        }
    }
    // WordPress Inquiries
    async createWordPressInquiry(req, res, next) {
        try {
            const { name, email, phone, subject, message } = req.body;
            if (!name || !email || !phone || !message) {
                return res.status(400).json({ message: 'Name, email, phone, and message are required' });
            }
            const inquiry = await database_1.default.wordPressInquiry.create({
                data: { name, email, phone, subject, message },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: inquiry, message: 'Inquiry saved successfully' });
        }
        catch (error) {
            next(error);
        }
    }
    async getWordPressInquiries(req, res, next) {
        try {
            const inquiries = await database_1.default.wordPressInquiry.findMany({
                orderBy: { createdAt: 'desc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: inquiries });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.SuperAdminController = SuperAdminController;
exports.superAdminController = new SuperAdminController();
