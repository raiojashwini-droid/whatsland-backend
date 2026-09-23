"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const database_1 = __importDefault(require("../config/database"));
const jwt_1 = require("../utils/jwt");
const appError_1 = require("../utils/appError");
const roleHelper_1 = require("../utils/roleHelper");
class AuthService {
    async login(email, pass) {
        let user = await database_1.default.user.findUnique({
            where: { email },
            include: { role: true, company: true },
        });
        if (!user) {
            throw new appError_1.AppError('Invalid credentials provided.', 401, 'INVALID_CREDENTIALS');
        }
        if (user.status !== 'Active') {
            throw new appError_1.AppError('Your account has been deactivated. Please contact support.', 403, 'USER_DEACTIVATED');
        }
        if (user.companyId && user.company) {
            if (user.company.status !== 'Active') {
                throw new appError_1.AppError('Your company account is suspended. Please contact support.', 403, 'COMPANY_SUSPENDED');
            }
        }
        const isValidPassword = await bcrypt_1.default.compare(pass, user.passwordHash).catch(() => false);
        if (!isValidPassword) {
            throw new appError_1.AppError('Invalid credentials provided.', 401, 'INVALID_CREDENTIALS');
        }
        let isTrialExpired = false;
        let isInGracePeriod = false;
        let isAccessBlocked = false;
        const compObj = user.company;
        if (compObj) {
            const now = new Date();
            const pName = (compObj.planName || '').toLowerCase();
            const pType = compObj.planType || (pName.includes('trial') || pName.includes('free') ? 'FREE_TRIAL' : (pName.includes('yearly') || pName.includes('annual') ? 'YEARLY' : 'MONTHLY'));
            const planEndsAt = compObj.planEndsAt ? new Date(compObj.planEndsAt) : (compObj.trialEndsAt ? new Date(compObj.trialEndsAt) : null);
            const graceEndsAt = compObj.graceEndsAt ? new Date(compObj.graceEndsAt) : (planEndsAt && pType !== 'FREE_TRIAL' ? new Date(planEndsAt.getTime() + 7 * 24 * 60 * 60 * 1000) : null);
            if (pType === 'FREE_TRIAL') {
                if (planEndsAt && now > planEndsAt) {
                    isTrialExpired = true;
                    isAccessBlocked = true; // Free trial has 0 extension
                }
            }
            else {
                // Paid Plan (Monthly or Yearly)
                if (planEndsAt && now > planEndsAt) {
                    if (graceEndsAt && now <= graceEndsAt) {
                        isInGracePeriod = true;
                        isAccessBlocked = false; // Grace period active: 1 week extension allowed with warning banner
                    }
                    else {
                        isAccessBlocked = true; // Grace period ended: Service OFF
                    }
                }
            }
            // If subscription is blocked AND user is NOT Property Manager or SuperAdmin (e.g. Tenant, Owner, Staff), block login completely!
            const roleName = user.role?.name || '';
            if (isAccessBlocked && roleName !== 'Property Manager' && roleName !== 'Super Admin' && roleName !== 'Admin') {
                throw new appError_1.AppError('Your company subscription has expired. Please contact your Property Manager to renew.', 403, 'COMPANY_SUBSCRIPTION_EXPIRED');
            }
        }
        let finalRoleName = user.role?.name || '';
        if (compObj && compObj.email && compObj.email.trim().toLowerCase() === user.email.trim().toLowerCase()) {
            finalRoleName = 'Property Manager';
            if (user.role?.name !== 'Property Manager') {
                const pmRole = await (0, roleHelper_1.ensureRole)('Property Manager');
                await database_1.default.user.update({
                    where: { id: user.id },
                    data: { roleId: pmRole.id }
                }).catch(() => { });
            }
        }
        if (!finalRoleName) {
            finalRoleName = user.companyId ? 'Property Manager' : 'Super Admin';
        }
        const payload = {
            userId: user.id,
            email: user.email,
            roleId: user.roleId,
            roleName: finalRoleName,
            companyId: user.companyId || undefined,
        };
        const accessToken = (0, jwt_1.generateAccessToken)(payload);
        const refreshToken = (0, jwt_1.generateRefreshToken)(payload);
        return {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                roleId: user.roleId,
                roleName: finalRoleName,
                companyId: user.companyId,
                companyName: compObj?.name || null,
                planName: compObj?.planName || null,
                planType: compObj?.planType || 'FREE_TRIAL',
                maxProperties: compObj?.maxProperties || 999999,
                maxUnits: compObj?.maxUnits || 999999,
                trialEndsAt: compObj?.trialEndsAt || compObj?.planEndsAt || null,
                planEndsAt: compObj?.planEndsAt || compObj?.trialEndsAt || null,
                graceEndsAt: compObj?.graceEndsAt || null,
                isTrialExpired,
                isInGracePeriod,
                isAccessBlocked,
            },
            accessToken,
            refreshToken,
        };
    }
    async refreshToken(token) {
        if (!token)
            throw new appError_1.AppError('Refresh token required.', 400, 'BAD_REQUEST');
        try {
            const decoded = (0, jwt_1.verifyRefreshToken)(token);
            const newAccessToken = (0, jwt_1.generateAccessToken)({
                userId: decoded.userId,
                email: decoded.email,
                roleId: decoded.roleId,
                roleName: decoded.roleName,
                companyId: decoded.companyId,
            });
            return { accessToken: newAccessToken };
        }
        catch (err) {
            throw new appError_1.AppError(err.message || 'Invalid or expired refresh token.', 401, 'UNAUTHORIZED');
        }
    }
    async changePassword(userEmail, currentPass, newPass) {
        if (!userEmail) {
            throw new appError_1.AppError('Authentication email is required.', 401, 'UNAUTHORIZED');
        }
        if (!currentPass) {
            throw new appError_1.AppError('Current password is required.', 400, 'BAD_REQUEST');
        }
        if (!newPass || newPass.length < 6) {
            throw new appError_1.AppError('New password must be at least 6 characters.', 400, 'BAD_REQUEST');
        }
        const user = await database_1.default.user.findFirst({
            where: userEmail ? { email: userEmail } : undefined,
        });
        if (!user) {
            throw new appError_1.AppError('User not found.', 404, 'NOT_FOUND');
        }
        const isPasswordValid = await bcrypt_1.default.compare(currentPass, user.passwordHash);
        if (!isPasswordValid) {
            throw new appError_1.AppError('Incorrect current password.', 400, 'INVALID_PASSWORD');
        }
        const hashedPassword = await bcrypt_1.default.hash(newPass, 10);
        await database_1.default.user.update({
            where: { id: user.id },
            data: { passwordHash: hashedPassword },
        });
        return { message: 'Password updated successfully in database.' };
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
