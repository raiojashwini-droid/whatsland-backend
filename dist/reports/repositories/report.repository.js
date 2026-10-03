"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportRepository = void 0;
const database_1 = __importDefault(require("../../config/database"));
class ReportRepository {
    // 1. Rent Roll Report Data
    async getRentRollData(params) {
        const { companyId, propertyIds, propertyId, leaseStatus, search, page, limit, sortBy, sortOrder = 'desc' } = params;
        const activePropertyIds = propertyId ? [propertyId] : propertyIds;
        if (!companyId || activePropertyIds.length === 0) {
            return { leases: [], totalRecords: 0, summary: { totalMonthlyRent: 0, totalSecurityDeposits: 0, occupiedCount: 0, vacantCount: 0, totalUnits: 0 } };
        }
        const whereClause = {
            companyId,
            propertyId: { in: activePropertyIds },
        };
        if (leaseStatus) {
            whereClause.status = leaseStatus;
        }
        if (search) {
            whereClause.AND = [
                {
                    OR: [
                        { tenant: { firstName: { contains: search } } },
                        { tenant: { lastName: { contains: search } } },
                        { property: { name: { contains: search } } },
                        { unit: { unitNumber: { contains: search } } },
                    ],
                },
            ];
        }
        const skip = (page - 1) * limit;
        let orderBy = { startDate: sortOrder };
        if (sortBy === 'endDate')
            orderBy = { endDate: sortOrder };
        if (sortBy === 'rentAmount')
            orderBy = { rentAmount: sortOrder };
        if (sortBy === 'depositAmount')
            orderBy = { depositAmount: sortOrder };
        const [leases, totalRecords, allLeases, allUnits] = await Promise.all([
            database_1.default.lease.findMany({
                where: whereClause,
                include: {
                    property: true,
                    unit: true,
                    tenant: true,
                },
                orderBy,
                skip,
                take: limit,
            }),
            database_1.default.lease.count({ where: whereClause }),
            database_1.default.lease.findMany({
                where: whereClause,
                include: { property: true, unit: true, tenant: true },
            }),
            database_1.default.unit.findMany({
                where: {
                    propertyId: { in: activePropertyIds },
                },
                include: { property: true, tenants: true },
            }),
        ]);
        let totalMonthlyRent = 0;
        let totalSecurityDeposits = 0;
        let occupiedCount = 0;
        if (allLeases.length > 0) {
            allLeases.forEach((l) => {
                totalMonthlyRent += Number(l.rentAmount || l.unit?.rentAmount || 0);
                totalSecurityDeposits += Number(l.depositAmount || l.unit?.securityDeposit || 0);
                if (l.status === 'Active' || l.unit?.status === 'Occupied')
                    occupiedCount++;
            });
        }
        else if (allUnits.length > 0) {
            allUnits.forEach((u) => {
                totalMonthlyRent += Number(u.rentAmount || 0);
                totalSecurityDeposits += Number(u.securityDeposit || 0);
                if (u.status === 'Occupied')
                    occupiedCount++;
            });
        }
        const totalUnitsCount = Math.max(allLeases.length, allUnits.length);
        const vacantCount = Math.max(0, totalUnitsCount - occupiedCount);
        return {
            leases,
            units: allLeases.length === 0 ? allUnits : [],
            totalRecords: totalRecords || allUnits.length,
            summary: {
                totalMonthlyRent,
                totalSecurityDeposits,
                occupiedCount,
                vacantCount,
                totalUnits: totalUnitsCount,
            },
        };
    }
    // 2. Occupancy Report Data
    async getOccupancyData(params) {
        const { companyId, propertyIds, propertyId, page, limit } = params;
        const activePropertyIds = propertyId ? [propertyId] : propertyIds;
        if (!companyId || activePropertyIds.length === 0) {
            return { properties: [], totalRecords: 0, summary: { portfolioTotalUnits: 0, portfolioOccupiedUnits: 0, portfolioVacantUnits: 0, portfolioMaintenanceUnits: 0, overallOccupancyPercentage: 0, totalProperties: 0 } };
        }
        const whereClause = {
            companyId,
            id: { in: activePropertyIds },
        };
        const skip = (page - 1) * limit;
        const [properties, totalRecords, allProperties] = await Promise.all([
            database_1.default.property.findMany({
                where: whereClause,
                include: {
                    units: {
                        select: {
                            status: true,
                        },
                    },
                },
                skip,
                take: limit,
            }),
            database_1.default.property.count({ where: whereClause }),
            database_1.default.property.findMany({
                where: whereClause,
                include: {
                    units: {
                        select: {
                            status: true,
                        },
                    },
                },
            }),
        ]);
        let portfolioTotalUnits = 0;
        let portfolioOccupiedUnits = 0;
        let portfolioVacantUnits = 0;
        let portfolioMaintenanceUnits = 0;
        allProperties.forEach((p) => {
            if (p.units) {
                portfolioTotalUnits += p.units.length;
                p.units.forEach((u) => {
                    if (u.status === 'Occupied')
                        portfolioOccupiedUnits++;
                    else if (u.status === 'UnderMaintenance')
                        portfolioMaintenanceUnits++;
                    else
                        portfolioVacantUnits++;
                });
            }
        });
        const overallOccupancyPercentage = portfolioTotalUnits > 0
            ? parseFloat(((portfolioOccupiedUnits / portfolioTotalUnits) * 100).toFixed(1))
            : 0.0;
        return {
            properties,
            totalRecords,
            summary: {
                portfolioTotalUnits,
                portfolioOccupiedUnits,
                portfolioVacantUnits,
                portfolioMaintenanceUnits,
                overallOccupancyPercentage,
                totalProperties: totalRecords,
            },
        };
    }
    // 3. Delinquency Report Data
    async getDelinquencyData(params) {
        const { companyId, propertyIds, propertyId, tenantId, status, page, limit, sortBy, sortOrder = 'desc' } = params;
        const activePropertyIds = propertyId ? [propertyId] : propertyIds;
        if (!companyId || activePropertyIds.length === 0) {
            return { invoices: [], totalRecords: 0, summary: { totalDelinquentBalance: 0, totalOriginalAmount: 0, totalDelinquentTenants: 0, totalDelinquentInvoices: 0, averageDaysLate: 0 } };
        }
        const whereClause = {
            companyId,
            propertyId: { in: activePropertyIds },
        };
        if (tenantId) {
            whereClause.tenantId = tenantId;
        }
        if (status) {
            whereClause.status = status;
        }
        else {
            whereClause.status = { in: ['Unpaid', 'Overdue', 'Partially Paid', 'OVERDUE', 'UNPAID', 'PARTIAL'] };
        }
        const skip = (page - 1) * limit;
        let orderBy = { dueDate: sortOrder };
        if (sortBy === 'balance')
            orderBy = { balance: sortOrder };
        if (sortBy === 'amount')
            orderBy = { amount: sortOrder };
        const [invoices, totalRecords, allDelinquentInvoices] = await Promise.all([
            database_1.default.invoice.findMany({
                where: whereClause,
                include: {
                    tenant: true,
                },
                orderBy,
                skip,
                take: limit,
            }),
            database_1.default.invoice.count({ where: whereClause }),
            database_1.default.invoice.findMany({
                where: whereClause,
                include: { tenant: true },
            }),
        ]);
        let totalDelinquentBalance = 0;
        let totalOriginalAmount = 0;
        let totalDaysLateSum = 0;
        const uniqueTenantIds = new Set();
        const todayMs = new Date().getTime();
        allDelinquentInvoices.forEach((inv) => {
            const bal = Number(inv.balance ?? (Number(inv.amount || 0) - Number(inv.paidAmount || 0)));
            totalDelinquentBalance += Math.max(0, bal);
            totalOriginalAmount += Number(inv.amount || 0);
            if (inv.tenantId)
                uniqueTenantIds.add(inv.tenantId);
            else if (inv.tenantName)
                uniqueTenantIds.add(inv.tenantName);
            const dueMs = inv.dueDate ? new Date(inv.dueDate).getTime() : todayMs;
            if (todayMs > dueMs) {
                totalDaysLateSum += Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24));
            }
        });
        const averageDaysLate = allDelinquentInvoices.length > 0
            ? Math.round(totalDaysLateSum / allDelinquentInvoices.length)
            : 0;
        return {
            invoices,
            totalRecords,
            summary: {
                totalDelinquentBalance,
                totalOriginalAmount,
                totalDelinquentTenants: uniqueTenantIds.size,
                totalDelinquentInvoices: totalRecords,
                averageDaysLate,
            },
        };
    }
    // 4. Profit & Loss Report Data
    async getProfitLossData(params) {
        const { companyId, propertyIds, propertyId, startDate, endDate } = params;
        const activePropertyIds = propertyId ? [propertyId] : propertyIds;
        if (!companyId || activePropertyIds.length === 0) {
            return [];
        }
        const whereClause = {
            journalEntry: {
                companyId,
            },
            propertyId: { in: activePropertyIds },
        };
        if (startDate || endDate) {
            whereClause.journalEntry.date = {};
            if (startDate)
                whereClause.journalEntry.date.gte = startDate;
            if (endDate)
                whereClause.journalEntry.date.lte = endDate;
        }
        // Retrieve general ledger lines aggregated by account
        const lines = await database_1.default.journalEntryLine.findMany({
            where: whereClause,
            include: {
                account: true,
                journalEntry: true,
            },
        });
        return lines;
    }
    // 5. Maintenance Report Data
    async getMaintenanceData(params) {
        const { companyId, propertyIds, propertyId, status, priority, page, limit, sortBy, sortOrder = 'desc' } = params;
        const activePropertyIds = propertyId ? [propertyId] : propertyIds;
        if (!companyId || activePropertyIds.length === 0) {
            return { workOrders: [], totalRecords: 0, summary: { totalWorkOrders: 0, totalEstimatedCost: 0, totalActualCost: 0, completedCount: 0, inProgressCount: 0, openCount: 0, completionRate: 0 } };
        }
        const whereClause = {
            companyId,
            propertyId: { in: activePropertyIds },
        };
        if (status) {
            whereClause.status = status;
        }
        if (priority) {
            whereClause.priority = priority;
        }
        const skip = (page - 1) * limit;
        let orderBy = { createdAt: sortOrder };
        if (sortBy === 'estimatedCost')
            orderBy = { estimatedCost: sortOrder };
        if (sortBy === 'actualCost')
            orderBy = { actualCost: sortOrder };
        const [workOrders, totalRecords, allWorkOrders] = await Promise.all([
            database_1.default.workOrder.findMany({
                where: whereClause,
                include: {
                    property: true,
                    vendor: true,
                },
                orderBy,
                skip,
                take: limit,
            }),
            database_1.default.workOrder.count({ where: whereClause }),
            database_1.default.workOrder.findMany({
                where: whereClause,
            }),
        ]);
        let totalEstimatedCost = 0;
        let totalActualCost = 0;
        let completedCount = 0;
        let inProgressCount = 0;
        let openCount = 0;
        allWorkOrders.forEach((w) => {
            totalEstimatedCost += Number(w.estimatedCost || 0);
            totalActualCost += Number(w.actualCost || w.cost || 0);
            if (w.status === 'Completed' || w.status === 'Closed')
                completedCount++;
            else if (w.status === 'InProgress' || w.status === 'Assigned')
                inProgressCount++;
            else
                openCount++;
        });
        const completionRate = allWorkOrders.length > 0
            ? parseFloat(((completedCount / allWorkOrders.length) * 100).toFixed(1))
            : 0.0;
        return {
            workOrders,
            totalRecords,
            summary: {
                totalWorkOrders: totalRecords,
                totalEstimatedCost,
                totalActualCost: totalActualCost || totalEstimatedCost,
                completedCount,
                inProgressCount,
                openCount,
                completionRate,
            },
        };
    }
    // 6. Payment History Report Data
    async getPaymentHistoryData(params) {
        const { companyId, propertyIds, propertyId, tenantId, paymentMethod, status, startDate, endDate, page, limit, sortBy, sortOrder = 'desc', } = params;
        const activePropertyIds = propertyId ? [propertyId] : propertyIds;
        if (!companyId || activePropertyIds.length === 0) {
            return { payments: [], totalRecords: 0, summary: { totalCollectedAmount: 0, totalTransactions: 0, averageTransaction: 0, methodMap: {} } };
        }
        const whereClause = {
            companyId,
            propertyId: { in: activePropertyIds },
        };
        if (tenantId) {
            whereClause.tenantId = tenantId;
        }
        if (paymentMethod) {
            whereClause.paymentMethod = paymentMethod;
        }
        if (status) {
            whereClause.status = status;
        }
        if (startDate || endDate) {
            whereClause.paidDate = {};
            if (startDate)
                whereClause.paidDate.gte = startDate;
            if (endDate)
                whereClause.paidDate.lte = endDate;
        }
        const skip = (page - 1) * limit;
        let orderBy = { paidDate: sortOrder };
        if (sortBy === 'amount')
            orderBy = { amount: sortOrder };
        const [payments, totalRecords, allPayments] = await Promise.all([
            database_1.default.rentPayment.findMany({
                where: whereClause,
                include: {
                    tenant: true,
                    property: true,
                    unit: true,
                },
                orderBy,
                skip,
                take: limit,
            }),
            database_1.default.rentPayment.count({ where: whereClause }),
            database_1.default.rentPayment.findMany({
                where: whereClause,
            }),
        ]);
        let totalCollectedAmount = 0;
        const methodMap = {};
        allPayments.forEach((p) => {
            const amt = Number(p.amount || 0);
            totalCollectedAmount += amt;
            const m = p.paymentMethod || 'ACH';
            methodMap[m] = (methodMap[m] || 0) + 1;
        });
        // If rentPayment is empty, aggregate paid invoices
        if (allPayments.length === 0) {
            const paidInvoices = await database_1.default.invoice.findMany({
                where: {
                    companyId,
                    propertyId: { in: activePropertyIds },
                    status: { in: ['Paid', 'Partially Paid'] },
                },
            });
            paidInvoices.forEach((inv) => {
                totalCollectedAmount += Number(inv.paidAmount || inv.amount || 0);
            });
        }
        const averageTransaction = allPayments.length > 0
            ? Math.round(totalCollectedAmount / allPayments.length)
            : 0;
        return {
            payments,
            totalRecords,
            summary: {
                totalCollectedAmount,
                totalTransactions: totalRecords || allPayments.length,
                averageTransaction,
                methodMap,
            },
        };
    }
    // Exports Tracking
    static inMemoryExports = [];
    async createExport(data) {
        try {
            if (database_1.default.reportExport) {
                return await database_1.default.reportExport.create({ data });
            }
        }
        catch (e) {
            console.warn('DB reportExport create failed, using in-memory store:', e);
        }
        const newEntry = {
            id: `exp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        ReportRepository.inMemoryExports.unshift(newEntry);
        return newEntry;
    }
    async saveExport(data) {
        return this.createExport(data);
    }
    async getExports(companyId, userId, page, limit) {
        try {
            if (database_1.default.reportExport) {
                const skip = (page - 1) * limit;
                const [exports, totalRecords] = await Promise.all([
                    database_1.default.reportExport.findMany({
                        where: companyId ? { OR: [{ companyId }, { companyId: null }] } : {},
                        orderBy: { createdAt: 'desc' },
                        skip,
                        take: limit,
                    }),
                    database_1.default.reportExport.count({
                        where: companyId ? { OR: [{ companyId }, { companyId: null }] } : {},
                    }),
                ]);
                if (exports && exports.length > 0) {
                    return { exports, totalRecords };
                }
            }
        }
        catch (e) {
            console.warn('DB reportExport findMany failed, returning in-memory store:', e);
        }
        const filtered = ReportRepository.inMemoryExports.filter((item) => !companyId || !item.companyId || item.companyId === companyId);
        const skip = (page - 1) * limit;
        const paginated = filtered.slice(skip, skip + limit);
        return { exports: paginated, totalRecords: filtered.length };
    }
    async updateExportStatus(id, status, fileUrl, errorMessage) {
        try {
            if (database_1.default.reportExport) {
                return await database_1.default.reportExport.update({
                    where: { id },
                    data: {
                        status,
                        fileUrl,
                        errorMessage,
                    },
                });
            }
        }
        catch (e) {
            console.warn('DB reportExport update failed, updating in-memory store:', e);
        }
        const item = ReportRepository.inMemoryExports.find((x) => x.id === id);
        if (item) {
            item.status = status;
            if (fileUrl)
                item.fileUrl = fileUrl;
            if (errorMessage)
                item.errorMessage = errorMessage;
            item.updatedAt = new Date();
        }
        return item;
    }
}
exports.ReportRepository = ReportRepository;
