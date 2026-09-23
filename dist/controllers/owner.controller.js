"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ownerController = exports.OwnerController = void 0;
const database_js_1 = __importDefault(require("../config/database.js"));
const apiResponse_js_1 = require("../utils/apiResponse.js");
const bcrypt_1 = __importDefault(require("bcrypt"));
const companyHelper_js_1 = require("../utils/companyHelper.js");
const appError_js_1 = require("../utils/appError.js");
const roleHelper_js_1 = require("../utils/roleHelper.js");
class OwnerController {
    async getAll(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const owners = await database_js_1.default.owner.findMany({
                where: companyId ? { companyId } : {},
                include: {
                    properties: true,
                },
            });
            return (0, apiResponse_js_1.sendSuccess)({ res, data: owners });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const { name, firstName, lastName, email, phone, payoutMethod, password, propertiesOwned } = req.body;
            const resolvedName = name || `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown';
            const companyId = await (0, companyHelper_js_1.getManagerCompanyId)(req, req.body.companyId || req.user?.companyId);
            if (email) {
                const normEmail = email.trim().toLowerCase();
                const existingOwner = await database_js_1.default.owner.findFirst({ where: { email: normEmail } });
                if (existingOwner) {
                    throw new appError_js_1.AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL');
                }
                const existingUser = await database_js_1.default.user.findFirst({ where: { email: normEmail } });
                if (existingUser) {
                    const activeCompany = await database_js_1.default.company.findFirst({ where: { email: normEmail } });
                    const activeTenant = await database_js_1.default.tenant.findFirst({ where: { email: normEmail } });
                    if (activeCompany || activeTenant) {
                        throw new appError_js_1.AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL');
                    }
                    else {
                        // Remove orphaned user record to allow fresh owner creation
                        await database_js_1.default.user.deleteMany({ where: { email: normEmail } });
                    }
                }
            }
            const owner = await database_js_1.default.owner.create({
                data: {
                    name: resolvedName,
                    email,
                    phone,
                    payoutMethod: payoutMethod || 'ACH/Direct Deposit',
                    companyId,
                },
            });
            if (Array.isArray(propertiesOwned) && propertiesOwned.length > 0) {
                await database_js_1.default.property.updateMany({
                    where: { id: { in: propertiesOwned } },
                    data: { ownerId: owner.id },
                });
            }
            if (password) {
                const role = await (0, roleHelper_js_1.ensureRole)('Owner');
                const passwordHash = await bcrypt_1.default.hash(password, 12);
                const [first = '', ...lastParts] = resolvedName.split(' ');
                const last = lastParts.join(' ') || 'Owner';
                await database_js_1.default.user.create({
                    data: {
                        email,
                        passwordHash,
                        firstName: first || 'Owner',
                        lastName: last,
                        phone: phone || null,
                        roleId: role.id,
                        companyId,
                    },
                });
            }
            return (0, apiResponse_js_1.sendSuccess)({ res, statusCode: 201, data: owner });
        }
        catch (error) {
            if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
                return next(new appError_js_1.AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL'));
            }
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const { name, firstName, lastName, email, phone, payoutMethod, password, propertiesOwned } = req.body;
            const resolvedName = name || `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown';
            const companyId = req.user?.companyId;
            const oldOwner = await database_js_1.default.owner.findUnique({
                where: { id },
            });
            const owner = await database_js_1.default.owner.update({
                where: companyId ? { id, companyId } : { id },
                data: {
                    name: resolvedName,
                    email,
                    phone,
                    payoutMethod,
                },
            });
            if (Array.isArray(propertiesOwned)) {
                if (propertiesOwned.length > 0) {
                    await database_js_1.default.property.updateMany({
                        where: { id: { in: propertiesOwned } },
                        data: { ownerId: owner.id },
                    });
                }
            }
            if (password && oldOwner) {
                const passwordHash = await bcrypt_1.default.hash(password, 12);
                const [first = '', ...lastParts] = resolvedName.split(' ');
                const last = lastParts.join(' ') || 'Owner';
                const existingUser = await database_js_1.default.user.findFirst({
                    where: { email: oldOwner.email },
                });
                if (existingUser) {
                    await database_js_1.default.user.update({
                        where: { id: existingUser.id },
                        data: {
                            email,
                            passwordHash,
                            firstName: first || 'Owner',
                            lastName: last,
                            phone,
                        },
                    });
                }
                else {
                    const role = await (0, roleHelper_js_1.ensureRole)('Owner');
                    await database_js_1.default.user.create({
                        data: {
                            email,
                            passwordHash,
                            firstName: first || 'Owner',
                            lastName: last,
                            phone: phone || null,
                            roleId: role.id,
                            companyId,
                        },
                    });
                }
            }
            return (0, apiResponse_js_1.sendSuccess)({ res, data: owner });
        }
        catch (error) {
            if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
                return next(new appError_js_1.AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL'));
            }
            next(error);
        }
    }
    async delete(req, res, next) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const companyId = req.user?.companyId;
            const ownerExists = await database_js_1.default.owner.findFirst({
                where: companyId ? { id, companyId } : { id },
            });
            if (!ownerExists) {
                return res.status(404).json({ success: false, error: 'Owner not found' });
            }
            await database_js_1.default.$transaction(async (tx) => {
                // 1. Delete associated owner distributions
                await tx.ownerDistribution.deleteMany({
                    where: { ownerId: id },
                });
                // 2. Delete associated owner documents
                await tx.ownerDocument.deleteMany({
                    where: { ownerId: id },
                });
                // 3. Find properties owned by this owner
                const properties = await tx.property.findMany({
                    where: { ownerId: id },
                    select: { id: true },
                });
                for (const prop of properties) {
                    const propertyId = prop.id;
                    // Delete rent payments linked to property
                    await tx.rentPayment.deleteMany({
                        where: { propertyId },
                    });
                    // Find leases linked to property and clean up MoveIn / MoveOut / Leases
                    const leases = await tx.lease.findMany({
                        where: { propertyId },
                        select: { id: true },
                    });
                    const leaseIds = leases.map((l) => l.id);
                    if (leaseIds.length > 0) {
                        await tx.moveIn.deleteMany({
                            where: { leaseId: { in: leaseIds } },
                        });
                        await tx.moveOut.deleteMany({
                            where: { leaseId: { in: leaseIds } },
                        });
                        await tx.lease.deleteMany({
                            where: { propertyId },
                        });
                    }
                    // Delete work orders linked to property
                    await tx.workOrder.deleteMany({
                        where: { propertyId },
                    });
                    // Delete service requests linked to property
                    await tx.serviceRequest.deleteMany({
                        where: { propertyId },
                    });
                    // Delete tenant documents linked to property
                    await tx.tenantDocument.deleteMany({
                        where: { propertyId },
                    });
                    // Delete owner documents linked to property
                    await tx.ownerDocument.deleteMany({
                        where: { propertyId },
                    });
                    // Delete units and buildings
                    await tx.unit.deleteMany({
                        where: { propertyId },
                    });
                    await tx.building.deleteMany({
                        where: { propertyId },
                    });
                    // Delete property
                    await tx.property.delete({
                        where: { id: propertyId },
                    });
                }
                // 3.5 Delete associated user record safely
                if (ownerExists.email) {
                    const normEmail = ownerExists.email.trim().toLowerCase();
                    const users = await tx.user.findMany({ where: { email: normEmail }, select: { id: true } });
                    const userIds = users.map(u => u.id);
                    if (userIds.length > 0) {
                        await tx.auditLog.updateMany({
                            where: { userId: { in: userIds } },
                            data: { userId: null }
                        });
                        await tx.user.deleteMany({
                            where: { email: normEmail },
                        });
                    }
                }
                // 4. Finally delete the owner record
                await tx.owner.delete({
                    where: { id },
                });
            }, { maxWait: 10000, timeout: 30000 });
            return (0, apiResponse_js_1.sendSuccess)({ res, message: 'Owner deleted successfully' });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.OwnerController = OwnerController;
exports.ownerController = new OwnerController();
