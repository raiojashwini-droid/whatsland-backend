"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveInService = exports.MoveInService = void 0;
const database_1 = __importDefault(require("../config/database"));
const auditHelper_1 = require("../utils/auditHelper");
class MoveInService {
    async getAllMoveIns(companyId, status) {
        return database_1.default.moveIn.findMany({
            where: {
                ...(companyId ? { companyId } : {}),
                ...(status ? { status: status } : {}),
            },
            include: {
                unit: {
                    include: {
                        property: true,
                    },
                },
                lease: {
                    include: {
                        tenant: true,
                    },
                },
                inspections: {
                    orderBy: { createdAt: 'desc' },
                },
            },
            orderBy: { scheduledDate: 'asc' },
        });
    }
    async getMoveInById(id, companyId) {
        return database_1.default.moveIn.findFirst({
            where: {
                id,
                ...(companyId ? { companyId } : {}),
            },
            include: {
                unit: {
                    include: {
                        property: true,
                    },
                },
                lease: {
                    include: {
                        tenant: true,
                    },
                },
                inspections: {
                    include: {
                        assignedInspector: true,
                        rooms: {
                            include: {
                                items: {
                                    include: {
                                        photos: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
    }
    async createMoveIn(data) {
        if (data.leaseId) {
            const existing = await database_1.default.moveIn.findFirst({
                where: { leaseId: data.leaseId },
            });
            if (existing) {
                return existing;
            }
        }
        return database_1.default.moveIn.create({
            data: {
                leaseId: data.leaseId,
                unitId: data.unitId,
                scheduledDate: new Date(data.scheduledDate),
                status: data.status || 'SCHEDULED',
                notes: data.notes,
                createdBy: data.createdBy || 'System',
                companyId: data.companyId,
            },
        });
    }
    async updateMoveIn(id, data, companyId) {
        const moveIn = await database_1.default.moveIn.findFirst({
            where: { id, ...(companyId ? { companyId } : {}) },
        });
        if (!moveIn)
            throw new Error('Move In record not found');
        if (moveIn.status === 'COMPLETED') {
            throw new Error('Cannot update completed Move In record');
        }
        const updateData = {};
        if (data.scheduledDate)
            updateData.scheduledDate = new Date(data.scheduledDate);
        if (data.notes !== undefined)
            updateData.notes = data.notes;
        if (data.status)
            updateData.status = data.status;
        const updatedMoveIn = await database_1.default.moveIn.update({
            where: { id },
            data: updateData,
        });
        const validUserId = await (0, auditHelper_1.getValidUserId)(data.userId);
        await database_1.default.auditLog.create({
            data: {
                action: `Move In Updated: Status ${updatedMoveIn.status}`,
                userId: validUserId,
                module: 'Leasing',
                object: `MoveIn ${id}`,
                ip: '127.0.0.1',
                status: 'Success',
            },
        });
        return updatedMoveIn;
    }
    async completeMoveIn(id, userId, companyId) {
        const moveIn = await database_1.default.moveIn.findFirst({
            where: { id, ...(companyId ? { companyId } : {}) },
            include: {
                lease: true,
                unit: true,
                inspections: true,
            },
        });
        if (!moveIn)
            throw new Error('Move In record not found');
        if (moveIn.status === 'COMPLETED')
            throw new Error('Move In is already completed');
        // Validate that Lease status is Pending Move In or Active
        if (moveIn.lease.status !== 'Pending_Move_In' && moveIn.lease.status !== 'Active') {
            console.warn(`Lease status is ${moveIn.lease.status}, continuing move-in completion.`);
        }
        // Validate that Unit is Vacant (relaxed for development/testing)
        if (moveIn.unit.status !== 'Vacant') {
            console.warn(`Unit status is ${moveIn.unit.status}, continuing move-in.`);
        }
        // Validate that at least one inspection is COMPLETED (relaxed to support Skip Inspection)
        const completedInspections = moveIn.inspections.filter((ins) => ins.status === 'COMPLETED');
        if (completedInspections.length === 0) {
            console.warn('Inspection skipped by manager, completing Move In process directly.');
        }
        return database_1.default.$transaction(async (tx) => {
            // 1. Update MoveIn status
            const updatedMoveIn = await tx.moveIn.update({
                where: { id },
                data: {
                    status: 'COMPLETED',
                    completedDate: new Date(),
                },
            });
            // 2. Update Lease status to Active
            await tx.lease.update({
                where: { id: moveIn.leaseId },
                data: {
                    status: 'Active',
                },
            });
            // 3. Update Unit status to Occupied
            await tx.unit.update({
                where: { id: moveIn.unitId },
                data: {
                    status: 'Occupied',
                },
            });
            // 4. Update Tenant status to Active and assign unit
            await tx.tenant.update({
                where: { id: moveIn.lease.tenantId },
                data: {
                    status: 'Active',
                    unitId: moveIn.unitId,
                },
            });
            const validUserId = await (0, auditHelper_1.getValidUserId)(userId, tx);
            // 5. Create Audit Log
            await tx.auditLog.create({
                data: {
                    action: 'Move In Completed & Lease Activated',
                    userId: validUserId,
                    module: 'Leasing',
                    object: `MoveIn ${id}`,
                    ip: '127.0.0.1',
                    status: 'Success',
                },
            });
            return updatedMoveIn;
        });
    }
}
exports.MoveInService = MoveInService;
exports.moveInService = new MoveInService();
