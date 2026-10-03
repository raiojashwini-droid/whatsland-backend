"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.companyController = exports.CompanyController = void 0;
const database_1 = __importDefault(require("../config/database"));
const apiResponse_1 = require("../utils/apiResponse");
const appError_1 = require("../utils/appError");
const companyHelper_1 = require("../utils/companyHelper");
class CompanyController {
    // Get Company Settings (including Late Fee & Grace Period Settings)
    async getSettings(req, res, next) {
        try {
            const user = req.user;
            const companyId = await (0, companyHelper_1.getManagerCompanyId)(user);
            if (!companyId) {
                // Fallback default settings if user has no assigned company
                return (0, apiResponse_1.sendSuccess)({
                    res,
                    data: {
                        lateFeeGraceDays: 10,
                        lateFeeAmount: 50,
                        lateFeeType: 'FLAT',
                        isLateFeeEnabled: true,
                    },
                });
            }
            const company = await database_1.default.company.findUnique({
                where: { id: companyId },
            });
            if (!company) {
                throw new appError_1.AppError('Company not found.', 404, 'NOT_FOUND');
            }
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    id: company.id,
                    name: company.name,
                    email: company.email,
                    phone: company.phone,
                    lateFeeGraceDays: company.lateFeeGraceDays ?? 10,
                    lateFeeAmount: company.lateFeeAmount ?? 50,
                    lateFeeType: company.lateFeeType || 'FLAT',
                    isLateFeeEnabled: company.isLateFeeEnabled ?? true,
                    planName: company.planName,
                    status: company.status,
                },
            });
        }
        catch (e) {
            next(e);
        }
    }
    // Update Company Settings (Manager sets Grace Days, Late Fee Amount, etc.)
    async updateSettings(req, res, next) {
        try {
            const user = req.user;
            const companyId = await (0, companyHelper_1.getManagerCompanyId)(user);
            if (!companyId) {
                throw new appError_1.AppError('No company associated with your account.', 400, 'BAD_REQUEST');
            }
            const { lateFeeGraceDays, lateFeeAmount, lateFeeType, isLateFeeEnabled, name, phone, email } = req.body;
            const updateData = {};
            if (lateFeeGraceDays !== undefined)
                updateData.lateFeeGraceDays = parseInt(lateFeeGraceDays) || 10;
            if (lateFeeAmount !== undefined)
                updateData.lateFeeAmount = parseFloat(lateFeeAmount) || 0;
            if (lateFeeType !== undefined)
                updateData.lateFeeType = lateFeeType;
            if (isLateFeeEnabled !== undefined)
                updateData.isLateFeeEnabled = Boolean(isLateFeeEnabled);
            if (name)
                updateData.name = name;
            if (phone)
                updateData.phone = phone;
            if (email)
                updateData.email = email;
            const updated = await database_1.default.company.update({
                where: { id: companyId },
                data: updateData,
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                message: 'Company settings updated successfully.',
                data: {
                    id: updated.id,
                    name: updated.name,
                    email: updated.email,
                    phone: updated.phone,
                    lateFeeGraceDays: updated.lateFeeGraceDays,
                    lateFeeAmount: updated.lateFeeAmount,
                    lateFeeType: updated.lateFeeType,
                    isLateFeeEnabled: updated.isLateFeeEnabled,
                },
            });
        }
        catch (e) {
            next(e);
        }
    }
}
exports.CompanyController = CompanyController;
exports.companyController = new CompanyController();
