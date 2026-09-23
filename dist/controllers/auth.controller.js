"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = exports.AuthController = void 0;
const auth_service_1 = require("../services/auth.service");
const superadmin_service_1 = require("../services/superadmin.service");
const authorizeNet_service_1 = require("../services/authorizeNet.service");
const apiResponse_1 = require("../utils/apiResponse");
const database_1 = __importDefault(require("../config/database"));
const appError_1 = require("../utils/appError");
const roleHelper_1 = require("../utils/roleHelper");
const bcrypt_1 = __importDefault(require("bcrypt"));
class AuthController {
    async login(req, res, next) {
        try {
            const { email, password } = req.body;
            const result = await auth_service_1.authService.login(email, password);
            return (0, apiResponse_1.sendSuccess)({ res, data: result, message: 'Authentication successful.' });
        }
        catch (error) {
            next(error);
        }
    }
    async register(req, res, next) {
        try {
            const result = await superadmin_service_1.superAdminService.createCompany(req.body);
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: result, message: 'Registration successful.' });
        }
        catch (error) {
            next(error);
        }
    }
    async refresh(req, res, next) {
        try {
            const { refreshToken } = req.body;
            const result = await auth_service_1.authService.refreshToken(refreshToken);
            return (0, apiResponse_1.sendSuccess)({ res, data: result });
        }
        catch (error) {
            next(error);
        }
    }
    async changePassword(req, res, next) {
        try {
            const { currentPassword, newPassword } = req.body;
            const userEmail = req.user?.email;
            const result = await auth_service_1.authService.changePassword(userEmail, currentPassword, newPassword);
            return (0, apiResponse_1.sendSuccess)({ res, data: result, message: 'Password changed successfully.' });
        }
        catch (error) {
            next(error);
        }
    }
    async getPublicPlans(req, res, next) {
        try {
            const plans = await superadmin_service_1.superAdminService.getPlans();
            return (0, apiResponse_1.sendSuccess)({ res, data: plans });
        }
        catch (error) {
            next(error);
        }
    }
    async createHostedPayment(req, res, next) {
        try {
            const { amount, planName, description, email } = req.body;
            if (email && typeof email === 'string' && email.trim().length > 0) {
                const normalizedEmail = email.trim().toLowerCase();
                const existingCompany = await database_1.default.company.findFirst({ where: { email: normalizedEmail } });
                if (existingCompany) {
                    throw new appError_1.AppError('Email address is already registered with a company. Please sign in instead.', 400, 'DUPLICATE_EMAIL');
                }
                const existingUser = await database_1.default.user.findFirst({ where: { email: normalizedEmail } });
                if (existingUser && existingUser.companyId) {
                    const userCompany = await database_1.default.company.findUnique({ where: { id: existingUser.companyId } });
                    if (userCompany) {
                        throw new appError_1.AppError('Email address is already registered with a company. Please sign in instead.', 400, 'DUPLICATE_EMAIL');
                    }
                }
            }
            const result = await authorizeNet_service_1.authorizeNetService.getHostedPaymentToken({
                amount: Number(amount) || 99,
                planName: planName || 'Subscription Plan',
                description: description || `SaaS Subscription Plan: ${planName}`,
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: result, message: 'Hosted payment token generated successfully.' });
        }
        catch (error) {
            next(error);
        }
    }
    async getPublicProperties(req, res, next) {
        try {
            const properties = await database_1.default.property.findMany({
                select: {
                    id: true,
                    name: true,
                    companyId: true,
                    address: true,
                    imageUrl: true,
                    owner: {
                        select: {
                            name: true,
                        },
                    },
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: properties });
        }
        catch (error) {
            next(error);
        }
    }
    async tenantSignup(req, res, next) {
        try {
            const { firstName, lastName, email, phone, password, companyId, property, dob, nationality, idType, idNumber, emergencyName, emergencyRelationship, emergencyPhone, employer, position, monthlyIncome, employmentStatus, currentAddress, budget, moveInDate, notes, priority, } = req.body;
            if (!firstName || !lastName || !email || !phone || !password || !companyId) {
                throw new appError_1.AppError('Required parameters are missing (name, email, phone, password, and companyId are required).', 400, 'BAD_REQUEST');
            }
            const result = await database_1.default.$transaction(async (tx) => {
                const existingUser = await tx.user.findUnique({ where: { email } });
                if (existingUser) {
                    throw new appError_1.AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL');
                }
                const passwordHash = await bcrypt_1.default.hash(password, 12);
                const role = await (0, roleHelper_1.ensureRole)('Tenant');
                const tenant = await tx.tenant.create({
                    data: {
                        firstName,
                        lastName,
                        email,
                        phone,
                        status: 'Pending',
                        companyId,
                        dob: dob || null,
                        nationality: nationality || null,
                        idType: idType || null,
                        idNumber: idNumber || null,
                        emergencyName: emergencyName || null,
                        emergencyRelationship: emergencyRelationship || null,
                        emergencyPhone: emergencyPhone || null,
                        employer: employer || null,
                        position: position || null,
                        monthlyIncome: monthlyIncome ? Number(monthlyIncome) : null,
                        employmentStatus: employmentStatus || null,
                        currentAddress: currentAddress || null,
                    },
                });
                await tx.user.create({
                    data: {
                        email,
                        passwordHash,
                        firstName,
                        lastName,
                        phone: phone || null,
                        roleId: role.id,
                        companyId,
                        status: 'Active',
                    },
                });
                const resolvedName = [firstName, lastName].filter(Boolean).join(' ') || 'Unnamed Lead';
                const lead = await tx.crmLead.create({
                    data: {
                        name: resolvedName,
                        email,
                        phone,
                        source: 'Portal',
                        status: 'New',
                        budget: budget ? Number(budget) : null,
                        moveInDate: moveInDate || null,
                        priority: priority || 'Medium',
                        notes: notes || null,
                        property: property || null,
                        companyId,
                    },
                });
                return { tenant, lead };
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: result, message: 'Tenant signup and application submitted successfully.' });
        }
        catch (error) {
            next(error);
        }
    }
    async checkEmailAvailability(req, res, next) {
        try {
            const { email } = req.body;
            if (!email) {
                throw new appError_1.AppError('Email is required', 400, 'BAD_REQUEST');
            }
            const emailLower = email.toLowerCase();
            const existingUser = await database_1.default.user.findFirst({
                where: { email: emailLower },
            });
            const existingTenant = await database_1.default.tenant.findFirst({
                where: { email: emailLower },
            });
            const exists = !!(existingUser || existingTenant);
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: { exists },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.AuthController = AuthController;
exports.authController = new AuthController();
