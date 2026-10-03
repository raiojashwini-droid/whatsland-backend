"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveOutService = exports.MoveOutService = void 0;
const database_1 = __importDefault(require("../config/database"));
const auditHelper_1 = require("../utils/auditHelper");
class MoveOutService {
    async getAllMoveOuts(companyId, status) {
        return database_1.default.moveOut.findMany({
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
    async getMoveOutById(id, companyId) {
        return database_1.default.moveOut.findFirst({
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
                damageItems: true,
                depositSummary: true,
            },
        });
    }
    async createMoveOut(data) {
        if (data.leaseId) {
            const existing = await database_1.default.moveOut.findFirst({
                where: { leaseId: data.leaseId },
            });
            if (existing) {
                return existing;
            }
        }
        // Determine the unitId from the lease if not supplied
        let unitId = data.unitId;
        if (!unitId) {
            const lease = await database_1.default.lease.findUnique({ where: { id: data.leaseId } });
            if (!lease)
                throw new Error('Lease not found');
            unitId = lease.unitId;
        }
        return database_1.default.moveOut.create({
            data: {
                leaseId: data.leaseId,
                unitId,
                scheduledDate: new Date(data.scheduledDate),
                status: 'SCHEDULED',
                notes: data.notes,
                createdBy: data.createdBy || 'System',
                companyId: data.companyId,
            },
        });
    }
    async updateMoveOut(id, data, companyId) {
        const moveOut = await database_1.default.moveOut.findFirst({
            where: { id, ...(companyId ? { companyId } : {}) },
        });
        if (!moveOut)
            throw new Error('Move Out record not found');
        if (moveOut.status === 'COMPLETED') {
            throw new Error('Cannot update completed Move Out record');
        }
        const updateData = {};
        if (data.scheduledDate)
            updateData.scheduledDate = new Date(data.scheduledDate);
        if (data.notes !== undefined)
            updateData.notes = data.notes;
        if (data.status)
            updateData.status = data.status;
        const updatedMoveOut = await database_1.default.moveOut.update({
            where: { id },
            data: updateData,
        });
        const validUserId = await (0, auditHelper_1.getValidUserId)(data.userId);
        await database_1.default.auditLog.create({
            data: {
                action: `Move Out Updated: Status ${updatedMoveOut.status}`,
                userId: validUserId,
                module: 'Leasing',
                object: `MoveOut ${id}`,
                ip: '127.0.0.1',
                status: 'Success',
            },
        });
        return updatedMoveOut;
    }
    async startInspection(moveOutId, templateId, userId, companyId) {
        const moveOut = await database_1.default.moveOut.findFirst({
            where: { id: moveOutId, ...(companyId ? { companyId } : {}) },
            include: { unit: true },
        });
        if (!moveOut)
            throw new Error('Move Out not found');
        // Return existing inspection if already started for this Move-Out
        const existingInspection = await database_1.default.inspection.findFirst({
            where: { moveOutId },
        });
        if (existingInspection) {
            return existingInspection;
        }
        // Retrieve inspection template
        const template = await database_1.default.inspectionTemplate.findFirst({
            where: { id: templateId, ...(companyId ? { companyId } : {}) },
            include: {
                rooms: {
                    include: { items: true },
                },
            },
        });
        if (!template)
            throw new Error('Inspection template not found');
        // Generate guaranteed unique inspection number (e.g. MO-8392019)
        const timestampSuffix = String(Date.now()).slice(-6);
        const randomSuffix = String(Math.floor(100 + Math.random() * 900));
        const inspectionNumber = `MO-${timestampSuffix}${randomSuffix}`;
        return database_1.default.$transaction(async (tx) => {
            // 1. Create inspection snapshot
            const inspection = await tx.inspection.create({
                data: {
                    inspectionNumber,
                    type: 'MOVE_OUT',
                    moveOutId,
                    templateId,
                    templateName: template.name,
                    status: 'IN_PROGRESS',
                    createdBy: userId,
                    companyId,
                },
            });
            // 2. Clone template rooms and items
            for (const room of template.rooms) {
                const clonedRoom = await tx.inspectionRoom.create({
                    data: {
                        inspectionId: inspection.id,
                        name: room.name,
                        sortOrder: room.sortOrder,
                    },
                });
                for (const item of room.items) {
                    await tx.inspectionItem.create({
                        data: {
                            roomId: clonedRoom.id,
                            label: item.label,
                            required: item.required,
                            sortOrder: item.sortOrder,
                            completed: false,
                        },
                    });
                }
            }
            // 3. Update MoveOut workflow status
            await tx.moveOut.update({
                where: { id: moveOutId },
                data: { status: 'INSPECTION_IN_PROGRESS' },
            });
            return inspection;
        });
    }
    async submitDamageReview(moveOutId, items, userId, companyId) {
        const moveOut = await database_1.default.moveOut.findFirst({
            where: { id: moveOutId, ...(companyId ? { companyId } : {}) },
        });
        if (!moveOut)
            throw new Error('Move Out not found');
        return database_1.default.$transaction(async (tx) => {
            // Clear previous damage review items if any
            await tx.damageReviewItem.deleteMany({
                where: { moveOutId },
            });
            // Create new review items
            for (const item of items) {
                await tx.damageReviewItem.create({
                    data: {
                        moveOutId,
                        inspectionItemId: item.inspectionItemId,
                        roomName: item.roomName,
                        itemLabel: item.itemLabel,
                        condition: item.condition,
                        notes: item.notes,
                        decision: item.decision,
                        chargeAmount: item.chargeAmount ? parseFloat(item.chargeAmount) : 0,
                        reviewedBy: userId,
                        reviewedAt: new Date(),
                    },
                });
            }
            // Update MoveOut status to READY_FOR_COMPLETION or DAMAGE_REVIEW
            const updatedMoveOut = await tx.moveOut.update({
                where: { id: moveOutId },
                data: { status: 'READY_FOR_COMPLETION' },
            });
            return updatedMoveOut;
        });
    }
    async saveDepositSummary(moveOutId, data) {
        return database_1.default.moveOutDepositSummary.upsert({
            where: { moveOutId },
            create: {
                moveOutId,
                originalDeposit: parseFloat(data.originalDeposit),
                totalCharges: parseFloat(data.totalCharges || 0),
                refundAmount: parseFloat(data.refundAmount || 0),
                notes: data.notes,
                approvedBy: data.approvedBy,
                approvedAt: data.approvedBy ? new Date() : null,
            },
            update: {
                originalDeposit: parseFloat(data.originalDeposit),
                totalCharges: parseFloat(data.totalCharges || 0),
                refundAmount: parseFloat(data.refundAmount || 0),
                notes: data.notes,
                approvedBy: data.approvedBy,
                approvedAt: data.approvedBy ? new Date() : null,
            },
        });
    }
    async completeMoveOut(id, userId, companyId) {
        const moveOut = await database_1.default.moveOut.findFirst({
            where: { id, ...(companyId ? { companyId } : {}) },
            include: {
                lease: true,
                unit: true,
                inspections: true,
            },
        });
        if (!moveOut)
            throw new Error('Move Out record not found');
        if (moveOut.status === 'COMPLETED')
            throw new Error('Move Out is already completed');
        // Validate that Lease is Active or Terminated (relaxed for skip workflow)
        if (moveOut.lease.status !== 'Active' && moveOut.lease.status !== 'Terminated' && moveOut.lease.status !== 'Ended' && moveOut.lease.status !== 'Pending_Move_In') {
            console.warn(`Lease status is ${moveOut.lease.status}, continuing move-out completion.`);
        }
        // Inspection check (relaxed to support Skip Inspection & Complete workflow)
        const completedInspections = moveOut.inspections.filter((ins) => ins.status === 'COMPLETED');
        if (completedInspections.length === 0) {
            console.warn('Inspection skipped by manager, completing Move Out process directly.');
        }
        return database_1.default.$transaction(async (tx) => {
            // 1. Update MoveOut status
            const updatedMoveOut = await tx.moveOut.update({
                where: { id },
                data: {
                    status: 'COMPLETED',
                    completedDate: new Date(),
                },
            });
            // 2. Update Unit status to Vacant
            await tx.unit.update({
                where: { id: moveOut.unitId },
                data: {
                    status: 'Vacant',
                },
            });
            // 3. Update Tenant status to Inactive and clear unitId
            await tx.tenant.update({
                where: { id: moveOut.lease.tenantId },
                data: {
                    status: 'Inactive',
                    unitId: null,
                },
            });
            // 4. Update Lease status to Ended
            await tx.lease.update({
                where: { id: moveOut.leaseId },
                data: {
                    status: 'Ended',
                },
            });
            const validUserId = await (0, auditHelper_1.getValidUserId)(userId, tx);
            // 6. Create Audit Log
            await tx.auditLog.create({
                data: {
                    action: 'Move Out Completed & Leases/Screenings Cleared',
                    userId: validUserId,
                    module: 'Leasing',
                    object: `Tenant ${moveOut.lease.tenantId}`,
                    ip: '127.0.0.1',
                    status: 'Success',
                },
            });
            return {
                ...moveOut,
                status: 'COMPLETED',
                completedDate: new Date(),
            };
        });
    }
    async cancelMoveOut(id, reason, userId, companyId) {
        const moveOut = await database_1.default.moveOut.findFirst({
            where: { id, ...(companyId ? { companyId } : {}) },
        });
        if (!moveOut)
            throw new Error('Move Out record not found');
        if (moveOut.status === 'COMPLETED')
            throw new Error('Cannot cancel a completed Move Out');
        return database_1.default.moveOut.update({
            where: { id },
            data: {
                status: 'CANCELLED',
                cancelReason: reason,
                cancelledBy: userId,
                cancelledAt: new Date(),
            },
        });
    }
}
exports.MoveOutService = MoveOutService;
exports.moveOutService = new MoveOutService();
