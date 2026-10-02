"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.leaseService = exports.LeaseService = void 0;
const database_1 = __importDefault(require("../config/database"));
const auditHelper_1 = require("../utils/auditHelper");
const appError_1 = require("../utils/appError");
class LeaseService {
    async getAllLeases(companyId) {
        return database_1.default.lease.findMany({
            where: companyId ? { companyId } : {},
            include: {
                tenant: true,
                property: true,
                unit: true,
            },
        });
    }
    async createLease(data) {
        return database_1.default.$transaction(async (tx) => {
            const leaseStatus = data.status || 'Pending_Move_In';
            const moveInStatus = (leaseStatus === 'Active' || data.moveInStatus === 'COMPLETED') ? 'COMPLETED' : 'SCHEDULED';
            const completedDate = moveInStatus === 'COMPLETED' ? new Date() : null;
            const lease = await tx.lease.create({
                data: {
                    tenantId: data.tenantId,
                    propertyId: data.propertyId,
                    unitId: data.unitId,
                    startDate: new Date(data.startDate),
                    endDate: new Date(data.endDate),
                    rentAmount: Number(data.rentAmount),
                    depositAmount: Number(data.depositAmount),
                    status: leaseStatus,
                    companyId: data.companyId,
                },
            });
            await tx.moveIn.create({
                data: {
                    leaseId: lease.id,
                    unitId: lease.unitId,
                    scheduledDate: lease.startDate,
                    status: moveInStatus,
                    completedDate: completedDate,
                    createdBy: data.createdBy || 'System',
                    companyId: data.companyId,
                },
            });
            const validUserId = await (0, auditHelper_1.getValidUserId)(data.userId, tx);
            await tx.auditLog.create({
                data: {
                    action: moveInStatus === 'COMPLETED' ? 'Active Lease Created & Move In Auto-Completed' : 'Lease Created & Move In Scheduled',
                    userId: validUserId,
                    module: 'Leasing',
                    object: `Lease ${lease.id}`,
                    ip: '127.0.0.1',
                    status: 'Success',
                },
            });
            return lease;
        });
    }
    async updateLease(id, data, companyId) {
        const lease = await database_1.default.lease.findFirst({
            where: { id, ...(companyId ? { companyId } : {}) },
        });
        if (!lease)
            throw new appError_1.AppError('Lease not found.', 404, 'NOT_FOUND');
        return database_1.default.$transaction(async (tx) => {
            const updatedLease = await tx.lease.update({
                where: { id },
                data: {
                    status: data.status,
                    endDate: data.endDate ? new Date(data.endDate) : undefined,
                },
            });
            if (data.status === 'Terminated') {
                const existingMoveOut = await tx.moveOut.findFirst({
                    where: { leaseId: id },
                });
                if (!existingMoveOut) {
                    await tx.moveOut.create({
                        data: {
                            leaseId: id,
                            unitId: lease.unitId,
                            scheduledDate: new Date(),
                            status: 'SCHEDULED',
                            notes: 'Automatically scheduled via lease termination',
                            createdBy: 'System',
                            companyId: lease.companyId,
                        },
                    });
                }
            }
            return updatedLease;
        });
    }
    async deleteLease(id, companyId) {
        if (companyId) {
            const lease = await database_1.default.lease.findFirst({
                where: { id, companyId },
            });
            if (!lease)
                throw new appError_1.AppError('Lease not found.', 404, 'NOT_FOUND');
        }
        return database_1.default.lease.delete({
            where: { id },
        });
    }
}
exports.LeaseService = LeaseService;
exports.leaseService = new LeaseService();
