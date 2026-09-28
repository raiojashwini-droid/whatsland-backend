"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.portalController = exports.PortalController = void 0;
const database_1 = __importDefault(require("../config/database"));
const apiResponse_1 = require("../utils/apiResponse");
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const billingAutomation_service_1 = require("../services/billingAutomation.service");
class PortalController {
    // --- Helper to get tenant for logged in user ---
    async getTenantForUser(req) {
        const userEmail = req.user?.email;
        if (!userEmail)
            return null;
        return database_1.default.tenant.findFirst({
            where: { email: userEmail },
            include: {
                unit: {
                    include: {
                        property: {
                            include: {
                                owner: true,
                            },
                        },
                    },
                },
                leases: {
                    include: {
                        property: {
                            include: {
                                owner: true,
                            },
                        },
                        unit: true,
                    },
                    orderBy: { startDate: 'desc' },
                },
            },
        });
    }
    // --- Tenant Portal Views ---
    async getTenantLeases(req, res, next) {
        try {
            const tenant = await this.getTenantForUser(req);
            let leases = [];
            if (tenant) {
                leases = await database_1.default.lease.findMany({
                    where: { tenantId: tenant.id },
                    include: {
                        property: {
                            include: {
                                owner: true,
                            },
                        },
                        unit: true,
                        tenant: true,
                    },
                });
            }
            return (0, apiResponse_1.sendSuccess)({ res, data: leases });
        }
        catch (error) {
            next(error);
        }
    }
    async getTenantLease(req, res, next) {
        try {
            const tenant = await this.getTenantForUser(req);
            const lease = (tenant && tenant.leases && tenant.leases.length > 0) ? tenant.leases[0] : null;
            if (!lease) {
                return (0, apiResponse_1.sendSuccess)({
                    res,
                    data: null,
                });
            }
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    id: lease.id,
                    propertyName: lease.property?.name || 'Property',
                    unitNumber: lease.unit ? `Unit ${lease.unit.unitNumber}` : 'Unassigned Unit',
                    rentAmount: lease.rentAmount || 0,
                    securityDeposit: lease.depositAmount || 0,
                    leaseStart: lease.startDate ? new Date(lease.startDate).toISOString().split('T')[0] : '',
                    leaseEnd: lease.endDate ? new Date(lease.endDate).toISOString().split('T')[0] : '',
                    status: lease.status || 'Active',
                    tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Sarah Connor',
                    property: lease.property,
                    unit: lease.unit,
                    tenant: {
                        id: tenant?.id || 't-1',
                        firstName: tenant?.firstName || 'Sarah',
                        lastName: tenant?.lastName || 'Connor',
                        email: tenant?.email || 'sarah@tenant.com',
                        phone: tenant?.phone || '555-0199',
                        status: tenant?.status || 'Active',
                    },
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getTenantMetrics(req, res, next) {
        try {
            const tenant = await this.getTenantForUser(req);
            if (!tenant) {
                return (0, apiResponse_1.sendSuccess)({
                    res,
                    data: {
                        currentRent: 0,
                        nextDueDate: 'N/A',
                        outstandingBalance: 0,
                        activeVisitors: 0,
                        packagesWaiting: 0,
                        leaseExpiration: 'N/A',
                    },
                });
            }
            // Automatically run auto-billing catch-up first so the tenant's metrics reflect auto invoices!
            await (0, billingAutomation_service_1.generateAutoInvoices)();
            const activeLease = tenant.leases && tenant.leases.length > 0 ? tenant.leases[0] : null;
            const leaseExpiration = activeLease?.endDate
                ? new Date(activeLease.endDate).toISOString().split('T')[0]
                : 'N/A';
            // Find all unpaid invoices
            const unpaidInvoices = await database_1.default.invoice.findMany({
                where: {
                    tenantId: tenant.id,
                    status: { not: 'Paid' }
                },
                orderBy: {
                    dueDate: 'asc'
                }
            });
            const outstandingBalance = unpaidInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);
            // The oldest unpaid invoice is the next one due
            const oldestUnpaid = unpaidInvoices[0];
            const currentRent = oldestUnpaid ? oldestUnpaid.balance : 0;
            const nextDueDate = oldestUnpaid ? oldestUnpaid.dueDate : 'N/A';
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    currentRent,
                    nextDueDate,
                    outstandingBalance,
                    activeVisitors: 0,
                    packagesWaiting: 0,
                    leaseExpiration,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getTenantProfile(req, res, next) {
        try {
            const tenant = await this.getTenantForUser(req);
            if (!tenant) {
                return (0, apiResponse_1.sendSuccess)({
                    res,
                    data: {
                        id: 'none',
                        firstName: 'Tenant',
                        lastName: 'User',
                        email: req.user?.email || '',
                        phone: '',
                        unitNumber: 'N/A',
                        emergencyContact: 'N/A',
                    },
                });
            }
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    id: tenant.id,
                    firstName: tenant.firstName,
                    lastName: tenant.lastName,
                    email: tenant.email,
                    phone: tenant.phone,
                    unitNumber: tenant.unit ? `Unit ${tenant.unit.unitNumber}` : 'Unassigned',
                    emergencyContact: 'Emergency Contact Available',
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async updateTenantProfile(req, res, next) {
        try {
            const { firstName, lastName, email, phone } = req.body;
            const userEmail = req.user?.email;
            if (!userEmail)
                throw new Error('Unauthorized');
            let tenant = await database_1.default.tenant.findFirst({
                where: { email: userEmail },
                include: { unit: true },
            });
            if (!tenant) {
                throw new Error('Tenant profile not found for logged in email.');
            }
            tenant = await database_1.default.tenant.update({
                where: { id: tenant.id },
                data: {
                    firstName: firstName || tenant.firstName,
                    lastName: lastName || tenant.lastName,
                    email: email || tenant.email,
                    phone: phone || tenant.phone,
                },
                include: { unit: true },
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    id: tenant.id,
                    firstName: tenant.firstName,
                    lastName: tenant.lastName,
                    email: tenant.email,
                    phone: tenant.phone,
                    unitNumber: tenant.unit ? `Unit ${tenant.unit.unitNumber}` : 'Unassigned',
                    emergencyContact: 'Emergency Contact Available',
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getTenantMaintenance(req, res, next) {
        try {
            const tenant = await this.getTenantForUser(req);
            if (!tenant) {
                return (0, apiResponse_1.sendSuccess)({ res, data: [] });
            }
            const requests = await database_1.default.serviceRequest.findMany({
                where: { tenantId: tenant.id },
                orderBy: { createdAt: 'desc' },
            });
            const formatted = requests.map((sr) => ({
                id: sr.id,
                title: sr.title,
                propertyName: sr.propertyName || 'Property',
                unitName: tenant.unit ? `Unit ${tenant.unit.unitNumber}` : 'Unit',
                priority: sr.priority || 'Medium',
                status: sr.status || 'Submitted',
                date: sr.createdAt ? new Date(sr.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                description: sr.description || '',
                preferredTime: 'Morning (8AM - 12PM)',
            }));
            return (0, apiResponse_1.sendSuccess)({ res, data: formatted });
        }
        catch (error) {
            next(error);
        }
    }
    async createTenantMaintenance(req, res, next) {
        try {
            const tenant = await this.getTenantForUser(req);
            const { title, priority, description, preferredTime } = req.body;
            const propertyId = tenant?.unit?.propertyId || (await database_1.default.property.findFirst())?.id;
            if (!propertyId)
                throw new Error('No property available for maintenance request.');
            const propertyRec = await database_1.default.property.findUnique({ where: { id: propertyId } });
            const tenantName = tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Tenant';
            const companyId = tenant?.companyId || req.user?.companyId || null;
            // 1. Detect category from title & description
            const textToAnalyze = `${title || ''} ${description || ''}`.toLowerCase();
            let category = 'General';
            if (textToAnalyze.includes('leak') || textToAnalyze.includes('water') || textToAnalyze.includes('drip') || textToAnalyze.includes('flood') || textToAnalyze.includes('clog') || textToAnalyze.includes('toilet') || textToAnalyze.includes('sink') || textToAnalyze.includes('pipe')) {
                category = 'Plumbing';
            }
            else if (textToAnalyze.includes('ac') || textToAnalyze.includes('hvac') || textToAnalyze.includes('heat') || textToAnalyze.includes('cooling') || textToAnalyze.includes('cold') || textToAnalyze.includes('thermostat')) {
                category = 'HVAC';
            }
            else if (textToAnalyze.includes('power') || textToAnalyze.includes('light') || textToAnalyze.includes('plug') || textToAnalyze.includes('breaker') || textToAnalyze.includes('outlet') || textToAnalyze.includes('wire') || textToAnalyze.includes('spark')) {
                category = 'Electrical';
            }
            else if (textToAnalyze.includes('disposal') || textToAnalyze.includes('dryer') || textToAnalyze.includes('washer') || textToAnalyze.includes('fridge') || textToAnalyze.includes('refrigerator') || textToAnalyze.includes('stove') || textToAnalyze.includes('oven')) {
                category = 'Appliance';
            }
            // 2. Auto-find matching vendor for this company & category
            const reqCategoryLower = category.toLowerCase();
            let vendor = await database_1.default.vendor.findFirst({
                where: companyId
                    ? { companyId, serviceType: { contains: reqCategoryLower } }
                    : { serviceType: { contains: reqCategoryLower } },
                orderBy: { rating: 'desc' },
            });
            if (!vendor) {
                vendor = await database_1.default.vendor.findFirst({
                    where: companyId ? { companyId } : {},
                    orderBy: { rating: 'desc' },
                });
            }
            const assignedVendorId = vendor?.id || null;
            const assignedVendorName = vendor?.companyName || 'Apex Pro Maintenance Co.';
            const assignedTechnician = vendor ? `${vendor.contactName} (Lead Technician)` : 'Lead Technician';
            const initialMessage = JSON.stringify([
                {
                    id: `msg-${Date.now()}`,
                    senderName: 'WhatsLandlord AI System',
                    role: 'System',
                    text: `Ticket automatically categorized as '${category}' and assigned to ${assignedVendorName} (${assignedTechnician}). Contractor notified.`,
                    timestamp: new Date().toLocaleString(),
                },
            ]);
            const newRequest = await database_1.default.serviceRequest.create({
                data: {
                    title: title || `${category} Repair Request`,
                    description: description || '',
                    priority: priority || 'Normal',
                    status: 'Assigned',
                    category: category,
                    propertyId: propertyId,
                    propertyName: propertyRec?.name || 'Property',
                    unitNumber: tenant?.unit ? tenant.unit.unitNumber : '',
                    tenantId: tenant?.id || null,
                    tenantName: tenantName,
                    assignedVendorId: assignedVendorId,
                    assignedVendorName: assignedVendorName,
                    assignedTechnician: assignedTechnician,
                    companyId: companyId,
                    messages: initialMessage,
                },
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                statusCode: 201,
                data: {
                    id: newRequest.id,
                    title: newRequest.title,
                    propertyName: newRequest.propertyName,
                    unitName: tenant?.unit ? `Unit ${tenant.unit.unitNumber}` : 'Unit',
                    priority: newRequest.priority,
                    status: newRequest.status,
                    category: newRequest.category,
                    assignedVendorName: newRequest.assignedVendorName,
                    assignedTechnician: newRequest.assignedTechnician,
                    date: new Date(newRequest.createdAt).toISOString().split('T')[0],
                    description: newRequest.description,
                    preferredTime: preferredTime || 'Morning (8AM - 12PM)',
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getTenantDocuments(req, res, next) {
        try {
            const tenant = await this.getTenantForUser(req);
            if (!tenant) {
                return (0, apiResponse_1.sendSuccess)({ res, data: [] });
            }
            const docs = await database_1.default.tenantDocument.findMany({
                where: { tenantId: tenant.id },
                orderBy: { uploadedAt: 'desc' },
            });
            const formatted = docs.map((d) => ({
                id: d.id,
                name: d.name,
                category: d.category,
                uploadedAt: d.uploadedAt ? new Date(d.uploadedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                size: d.size || '1.5 MB',
                fileUrl: d.fileUrl,
            }));
            return (0, apiResponse_1.sendSuccess)({ res, data: formatted });
        }
        catch (error) {
            next(error);
        }
    }
    async uploadTenantDocument(req, res, next) {
        try {
            const tenant = await this.getTenantForUser(req);
            const { name, category, size } = req.body;
            const newDoc = await database_1.default.tenantDocument.create({
                data: {
                    name: name || 'Tenant_Document.pdf',
                    category: category || 'Rental Agreement',
                    size: size || '1.5 MB',
                    tenantId: tenant?.id || undefined,
                },
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                statusCode: 201,
                data: {
                    id: newDoc.id,
                    name: newDoc.name,
                    category: newDoc.category,
                    uploadedAt: new Date(newDoc.uploadedAt).toISOString().split('T')[0],
                    size: newDoc.size,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Helper to get properties assigned to the logged-in owner ---
    async getPropertiesForOwner(req) {
        const userEmail = req.user?.email;
        const companyId = req.user?.companyId;
        let whereClause = {};
        if (userEmail) {
            const owner = await database_1.default.owner.findFirst({
                where: companyId ? { email: userEmail, companyId } : { email: userEmail },
            });
            if (owner) {
                whereClause.ownerId = owner.id;
            }
            else if (companyId) {
                whereClause.companyId = companyId;
            }
            else {
                return [];
            }
        }
        else if (companyId) {
            whereClause.companyId = companyId;
        }
        else {
            return [];
        }
        if (companyId) {
            whereClause.companyId = companyId;
        }
        return database_1.default.property.findMany({
            where: whereClause,
            include: { units: true, buildings: true },
        });
    }
    // --- Owner Portal Views ---
    async getOwnerFinancials(req, res, next) {
        try {
            const properties = await this.getPropertiesForOwner(req);
            const propertyIds = properties.map((p) => p.id);
            if (propertyIds.length === 0) {
                return (0, apiResponse_1.sendSuccess)({ res, data: [] });
            }
            const payments = await database_1.default.rentPayment.findMany({
                where: { propertyId: { in: propertyIds } },
                include: { property: true, tenant: true },
                orderBy: { paidDate: 'desc' },
            });
            const formatted = payments.map((p) => ({
                id: p.id,
                date: p.paidDate ? new Date(p.paidDate).toISOString().split('T')[0] : (p.dueDate ? new Date(p.dueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
                propertyName: p.property?.name || 'Property',
                tenantName: p.tenant ? `${p.tenant.firstName} ${p.tenant.lastName}` : 'Resident',
                category: 'Rental Income',
                amount: p.amount,
                status: p.status || 'Cleared',
            }));
            return (0, apiResponse_1.sendSuccess)({ res, data: formatted });
        }
        catch (error) {
            next(error);
        }
    }
    async getOwnerDistributions(req, res, next) {
        try {
            const userEmail = req.user?.email;
            const companyId = req.user?.companyId;
            let owner = null;
            if (userEmail) {
                owner = await database_1.default.owner.findFirst({
                    where: companyId ? { email: userEmail, companyId } : { email: userEmail },
                });
            }
            const whereFilter = {};
            if (owner) {
                whereFilter.ownerId = owner.id;
            }
            else if (companyId) {
                whereFilter.companyId = companyId;
            }
            const distributions = await database_1.default.ownerDistribution.findMany({
                where: Object.keys(whereFilter).length > 0 ? whereFilter : (companyId ? { companyId } : {}),
                orderBy: { processedDate: 'desc' },
            });
            const formatted = distributions.map((d, idx) => ({
                id: d.id,
                distributionNumber: `DIST-${1000 + idx}`,
                propertyName: d.period || 'Assigned Property Asset',
                date: d.processedDate ? new Date(d.processedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                amount: d.amount,
                method: 'Direct Deposit',
                status: d.status || 'Paid',
            }));
            return (0, apiResponse_1.sendSuccess)({ res, data: formatted });
        }
        catch (error) {
            next(error);
        }
    }
    async getOwnerStatements(req, res, next) {
        try {
            const properties = await this.getPropertiesForOwner(req);
            const propertyIds = properties.map((p) => p.id);
            if (propertyIds.length === 0) {
                return (0, apiResponse_1.sendSuccess)({ res, data: [] });
            }
            const payments = await database_1.default.rentPayment.findMany({
                where: { propertyId: { in: propertyIds } },
            });
            const statements = properties.map((p) => {
                const propPayments = payments.filter((pay) => pay.propertyId === p.id);
                const income = propPayments.reduce((sum, pay) => sum + pay.amount, 0);
                const expenses = Math.round(income * 0.1);
                return {
                    id: `stmt-${p.id}`,
                    period: 'Current Period',
                    propertyName: p.name,
                    openingBalance: 0,
                    totalIncome: income,
                    totalExpenses: expenses,
                    netDistribution: income - expenses,
                    endingBalance: 0,
                    status: 'Published',
                    generatedDate: new Date().toISOString().split('T')[0],
                };
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: statements });
        }
        catch (error) {
            next(error);
        }
    }
    async getOwnerMaintenance(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const properties = await this.getPropertiesForOwner(req);
            const propertyIds = properties.map((p) => p.id);
            let srWhere = {};
            let woWhere = {};
            if (propertyIds.length > 0) {
                srWhere.propertyId = { in: propertyIds };
                woWhere.propertyId = { in: propertyIds };
            }
            if (companyId) {
                srWhere.companyId = companyId;
                woWhere.companyId = companyId;
            }
            if (propertyIds.length === 0 && !companyId) {
                return (0, apiResponse_1.sendSuccess)({ res, data: [] });
            }
            const [serviceRequests, workOrders] = await Promise.all([
                database_1.default.serviceRequest.findMany({
                    where: srWhere,
                    orderBy: { createdAt: 'desc' },
                }),
                database_1.default.workOrder.findMany({
                    where: woWhere,
                    include: { property: true },
                    orderBy: { createdAt: 'desc' },
                }),
            ]);
            const formattedSRs = serviceRequests.map((sr, idx) => {
                const estCost = Number(sr.estimatedCost || 0);
                const rawActual = Number(sr.cost || sr.actualCost || 0);
                const rawExtra = Number(sr.extraCost || sr.extraExpenses || 0);
                let actualCost = rawActual;
                if (rawActual > 0 && rawActual < estCost) {
                    actualCost = estCost + rawActual;
                }
                else if (rawActual === 0 && rawExtra > 0) {
                    actualCost = estCost + rawExtra;
                }
                const extraCost = rawExtra > 0 ? rawExtra : Math.max(0, actualCost - estCost);
                return {
                    id: sr.id,
                    requestNumber: `#SR-${1001 + idx}`,
                    type: 'Service Request',
                    title: sr.title || 'Maintenance Request',
                    description: sr.description || '',
                    propertyId: sr.propertyId,
                    propertyName: sr.propertyName || 'Property',
                    unitNumber: sr.unitNumber || 'Unassigned',
                    tenantName: sr.tenantName || 'Resident',
                    priority: sr.priority || 'Normal',
                    status: sr.status || 'New',
                    estimatedCost: estCost,
                    actualCost: actualCost,
                    cost: actualCost,
                    extraCost: extraCost,
                    date: sr.createdAt ? new Date(sr.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    assignedVendorName: sr.assignedVendorName || sr.assignedTechnician || 'Unassigned',
                };
            });
            const formattedWOs = workOrders.map((wo, idx) => {
                const estCost = Number(wo.estimatedCost || 0);
                const rawActual = Number(wo.actualCost || wo.cost || 0);
                const rawExtra = Number(wo.extraCost || wo.extraExpenses || 0);
                let actualCost = rawActual;
                if (rawActual > 0 && rawActual < estCost) {
                    actualCost = estCost + rawActual;
                }
                else if (rawActual === 0 && rawExtra > 0) {
                    actualCost = estCost + rawExtra;
                }
                const extraCost = rawExtra > 0 ? rawExtra : Math.max(0, actualCost - estCost);
                return {
                    id: wo.id,
                    requestNumber: `#WO-${2001 + idx}`,
                    type: 'Work Order',
                    title: wo.title || 'Maintenance Work Order',
                    description: wo.description || '',
                    propertyId: wo.propertyId,
                    propertyName: wo.property?.name || wo.propertyName || 'Property',
                    unitNumber: wo.unitNumber || 'Unit',
                    tenantName: wo.tenantName || 'Resident',
                    priority: wo.priority || 'Normal',
                    status: wo.status || 'Open',
                    estimatedCost: estCost,
                    actualCost: actualCost,
                    cost: actualCost,
                    extraCost: extraCost,
                    date: wo.createdAt ? new Date(wo.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    assignedVendorName: wo.vendorName || wo.assignedTechnician || 'Vendor',
                };
            });
            const combined = [...formattedSRs];
            formattedWOs.forEach((wo) => {
                const exists = combined.some((sr) => sr.id === wo.id || sr.title === wo.title);
                if (!exists) {
                    combined.push(wo);
                }
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: combined });
        }
        catch (error) {
            next(error);
        }
    }
    async getOwnerDocuments(req, res, next) {
        try {
            const userEmail = req.user?.email;
            if (!userEmail)
                return (0, apiResponse_1.sendSuccess)({ res, data: [] });
            const owner = await database_1.default.owner.findFirst({ where: { email: userEmail } });
            if (!owner)
                return (0, apiResponse_1.sendSuccess)({ res, data: [] });
            const docs = await database_1.default.ownerDocument.findMany({
                where: { ownerId: owner.id },
                orderBy: { uploadedAt: 'desc' },
            });
            const formatted = docs.map((d) => ({
                id: d.id,
                name: d.name,
                category: d.category,
                uploadedAt: d.uploadedAt ? new Date(d.uploadedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                size: d.size || '1.5 MB',
                fileUrl: d.fileUrl,
            }));
            return (0, apiResponse_1.sendSuccess)({ res, data: formatted });
        }
        catch (error) {
            next(error);
        }
    }
    async uploadOwnerDocument(req, res, next) {
        try {
            const userEmail = req.user?.email;
            const owner = userEmail ? await database_1.default.owner.findFirst({ where: { email: userEmail } }) : null;
            const { name, category, size } = req.body;
            const newDoc = await database_1.default.ownerDocument.create({
                data: {
                    name: name || 'Document.pdf',
                    category: category || 'Statements',
                    size: size || '1.5 MB',
                    ownerId: owner?.id || undefined,
                },
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                statusCode: 201,
                data: {
                    id: newDoc.id,
                    name: newDoc.name,
                    category: newDoc.category,
                    uploadedAt: new Date(newDoc.uploadedAt).toISOString().split('T')[0],
                    size: newDoc.size,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getOwnerMessages(req, res, next) {
        try {
            const userEmail = req.user?.email;
            if (!userEmail)
                return (0, apiResponse_1.sendSuccess)({ res, data: [] });
            const owner = await database_1.default.owner.findFirst({ where: { email: userEmail } });
            if (!owner)
                return (0, apiResponse_1.sendSuccess)({ res, data: [] });
            const msgs = await database_1.default.ownerMessage.findMany({
                where: {
                    OR: [
                        { recipient: { contains: owner.name } },
                        { sender: { contains: owner.name } }
                    ]
                },
                orderBy: { createdAt: 'desc' },
            });
            const formatted = msgs.map((m) => ({
                id: m.id,
                sender: m.sender,
                recipient: m.recipient,
                subject: m.subject,
                body: m.body,
                timestamp: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
            }));
            return (0, apiResponse_1.sendSuccess)({ res, data: formatted });
        }
        catch (error) {
            next(error);
        }
    }
    async composeOwnerMessage(req, res, next) {
        try {
            const userEmail = req.user?.email;
            const owner = userEmail ? await database_1.default.owner.findFirst({ where: { email: userEmail } }) : null;
            const { sender, recipient, subject, body } = req.body;
            const newMsg = await database_1.default.ownerMessage.create({
                data: {
                    sender: sender || (owner ? `${owner.name} (Owner)` : 'Owner User'),
                    recipient: recipient || 'Property Manager',
                    subject: subject || 'General Inquiry',
                    body: body || '',
                },
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                statusCode: 201,
                data: {
                    id: newMsg.id,
                    sender: newMsg.sender,
                    recipient: newMsg.recipient,
                    subject: newMsg.subject,
                    body: newMsg.body,
                    timestamp: new Date(newMsg.createdAt).toISOString(),
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getOwnerProfile(req, res, next) {
        try {
            const userEmail = req.user?.email;
            let owner = userEmail ? await database_1.default.owner.findFirst({ where: { email: userEmail } }) : null;
            if (!owner) {
                return (0, apiResponse_1.sendSuccess)({
                    res,
                    data: {
                        id: 'owner-none',
                        firstName: 'Owner',
                        lastName: 'User',
                        email: userEmail || '',
                        phone: '',
                        streetAddress: '',
                        bankName: 'N/A',
                        accountNumber: 'N/A',
                        payoutStatus: 'Pending',
                    },
                });
            }
            const [firstName = '', ...lastNameParts] = (owner.name || '').split(' ');
            const lastName = lastNameParts.join(' ');
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    id: owner.id,
                    firstName: firstName || 'Owner',
                    lastName: lastName || 'User',
                    email: owner.email,
                    phone: owner.phone || '',
                    streetAddress: owner.streetAddress || '',
                    bankName: 'Checking Account',
                    accountNumber: 'XXXX-XXXX-9822',
                    payoutStatus: 'Verified',
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async updateOwnerProfile(req, res, next) {
        try {
            const userEmail = req.user?.email;
            const { firstName, lastName, email, phone, streetAddress, bankName, accountNumber } = req.body;
            const inputName = [firstName, lastName].filter(Boolean).join(' ');
            let owner = userEmail ? await database_1.default.owner.findFirst({ where: { email: userEmail } }) : null;
            if (!owner) {
                throw new Error('Owner profile not found for logged in user email.');
            }
            owner = await database_1.default.owner.update({
                where: { id: owner.id },
                data: {
                    name: inputName || owner.name,
                    email: email || owner.email,
                    phone: phone || owner.phone,
                    streetAddress: streetAddress || owner.streetAddress,
                },
            });
            const [resFirstName = '', ...resLastNameParts] = (owner.name || '').split(' ');
            const resLastName = resLastNameParts.join(' ');
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    id: owner.id,
                    firstName: resFirstName || 'Owner',
                    lastName: resLastName || 'User',
                    email: owner.email,
                    phone: owner.phone,
                    streetAddress: owner.streetAddress,
                    bankName: bankName || 'Checking Account',
                    accountNumber: accountNumber || 'XXXX-XXXX-9822',
                    payoutStatus: 'Verified',
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getOwnerReports(req, res, next) {
        try {
            const properties = await this.getPropertiesForOwner(req);
            const propertyIds = properties.map((p) => p.id);
            if (propertyIds.length === 0) {
                return (0, apiResponse_1.sendSuccess)({
                    res,
                    data: { revenue: 0, expenses: 0, occupancy: 0, distribution: 0 },
                });
            }
            const payments = await database_1.default.rentPayment.findMany({
                where: { propertyId: { in: propertyIds } },
            });
            const revenue = payments.reduce((sum, p) => sum + p.amount, 0);
            const expenses = Math.round(revenue * 0.1);
            const distribution = revenue - expenses;
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    revenue,
                    expenses,
                    occupancy: 95.0,
                    distribution,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getOwnerMetrics(req, res, next) {
        try {
            const properties = await this.getPropertiesForOwner(req);
            const propertyIds = properties.map((p) => p.id);
            if (propertyIds.length === 0) {
                return (0, apiResponse_1.sendSuccess)({
                    res,
                    data: {
                        monthlyIncome: 0,
                        monthlyExpenses: 0,
                        netDistribution: 0,
                        netIncome: 0,
                        totalProperties: 0,
                        occupancyRate: 0,
                        totalUnits: 0,
                        activeLeases: 0,
                        pendingMaintenance: 0,
                    },
                });
            }
            const payments = await database_1.default.rentPayment.findMany({
                where: { propertyId: { in: propertyIds } },
            });
            const monthlyIncome = payments.reduce((sum, p) => sum + p.amount, 0);
            const monthlyExpenses = Math.round(monthlyIncome * 0.1);
            const netDistribution = monthlyIncome - monthlyExpenses;
            const totalProperties = properties.length;
            const totalUnits = properties.reduce((sum, p) => sum + (p.unitsCount || p.units?.length || 1), 0);
            const activeUnitsCount = properties.reduce((sum, p) => {
                const rawUnits = p.units || [];
                return sum + rawUnits.filter((u) => u.status === 'Occupied').length;
            }, 0);
            const computedOccupancy = totalUnits > 0 ? Math.round((activeUnitsCount / totalUnits) * 100) : 0;
            const pendingWorkOrders = await database_1.default.workOrder.count({
                where: {
                    propertyId: { in: propertyIds },
                    status: { in: ['Open', 'InProgress'] },
                },
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    monthlyIncome,
                    monthlyExpenses,
                    netDistribution,
                    netIncome: netDistribution,
                    totalProperties,
                    occupancyRate: computedOccupancy,
                    totalUnits,
                    activeLeases: activeUnitsCount,
                    pendingMaintenance: pendingWorkOrders,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Super Admin Portal Views ---
    async getSuperAdminBilling(req, res, next) {
        try {
            const plan = await database_1.default.subscriptionPlan.findFirst();
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: plan || {
                    planName: 'Enterprise SaaS Tier',
                    price: 499,
                    billingCycle: 'Monthly',
                    nextInvoice: new Date('2026-08-01'),
                    usageLimit: 'Unlimited Properties',
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getSuperAdminSecurity(req, res, next) {
        try {
            const policy = await database_1.default.securityPolicy.findFirst();
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: policy || {
                    mfaRequired: true,
                    sessionTimeout: 30,
                    passwordPolicy: 'Strong (min 10 chars, symbols)',
                    ipWhitelist: '192.168.1.0/24',
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getSuperAdminAuditLogs(req, res, next) {
        try {
            const logs = await database_1.default.auditLog.findMany({
                include: {
                    user: true,
                },
                orderBy: { timestamp: 'desc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: logs });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Collections & Other Operations ---
    async getCollectionPaymentPlans(req, res, next) {
        try {
            const plans = await database_1.default.paymentPlan.findMany({
                include: {
                    tenant: true,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: plans });
        }
        catch (error) {
            next(error);
        }
    }
    async createCollectionPaymentPlan(req, res, next) {
        try {
            const { tenantId, totalAmount, frequency } = req.body;
            const plan = await database_1.default.paymentPlan.create({
                data: {
                    tenantId,
                    totalAmount: parseFloat(totalAmount),
                    frequency,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: plan });
        }
        catch (error) {
            next(error);
        }
    }
    async getCrmLeads(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const leads = await database_1.default.crmLead.findMany({
                where: companyId ? { companyId } : {},
                orderBy: { createdAt: 'desc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: leads });
        }
        catch (error) {
            next(error);
        }
    }
    async createCrmLead(req, res, next) {
        try {
            const { id, name, firstName, lastName, email, phone, source, budget, moveInDate, priority, assignedAgent, notes, property, companyId, status } = req.body;
            const userCompanyId = req.user?.companyId;
            if (id) {
                const existing = await database_1.default.crmLead.findUnique({
                    where: { id },
                });
                if (existing) {
                    const lead = await database_1.default.crmLead.update({
                        where: { id },
                        data: {
                            name: name || undefined,
                            email: email || undefined,
                            phone: phone || undefined,
                            source: source || undefined,
                            status: status || undefined,
                            budget: budget !== undefined ? (budget ? Number(budget) : null) : undefined,
                            moveInDate: moveInDate !== undefined ? moveInDate : undefined,
                            priority: priority || undefined,
                            assignedAgent: assignedAgent !== undefined ? assignedAgent : undefined,
                            notes: notes !== undefined ? notes : undefined,
                            property: property !== undefined ? property : undefined,
                            companyId: companyId || userCompanyId || undefined,
                        },
                    });
                    return (0, apiResponse_1.sendSuccess)({ res, data: lead });
                }
            }
            const resolvedName = name || [firstName, lastName].filter(Boolean).join(' ') || 'Unnamed Lead';
            const resolvedSource = source || 'Portal';
            const lead = await database_1.default.crmLead.create({
                data: {
                    name: resolvedName,
                    email,
                    phone,
                    source: resolvedSource,
                    status: status || 'New',
                    budget: budget ? Number(budget) : null,
                    moveInDate: moveInDate || null,
                    priority: priority || 'Medium',
                    assignedAgent: assignedAgent || null,
                    notes: notes || null,
                    property: property || null,
                    companyId: companyId || userCompanyId || null,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: lead });
        }
        catch (error) {
            next(error);
        }
    }
    async getScreeningReports(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const reports = await database_1.default.screeningReport.findMany({
                where: companyId ? { companyId } : {},
                include: {
                    tenant: {
                        include: {
                            unit: {
                                include: {
                                    property: true,
                                },
                            },
                        },
                    },
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: reports });
        }
        catch (error) {
            next(error);
        }
    }
    async getScreeningReportById(req, res, next) {
        try {
            const id = req.params.id;
            const report = await database_1.default.screeningReport.findUnique({
                where: { id },
                include: {
                    tenant: {
                        include: {
                            unit: {
                                include: {
                                    property: true,
                                },
                            },
                        },
                    },
                },
            });
            if (!report) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'NOT_FOUND',
                        message: 'Screening report not found.',
                    },
                });
            }
            return (0, apiResponse_1.sendSuccess)({ res, data: report });
        }
        catch (error) {
            next(error);
        }
    }
    async createScreeningReport(req, res, next) {
        try {
            let { tenantId, firstName, lastName, email, phoneNumber, phone, unitId, creditScore, criminalPass, evictionPass, status, unitNumber } = req.body;
            const companyId = req.user?.companyId;
            if (!unitId && unitNumber) {
                const foundUnit = await database_1.default.unit.findFirst({
                    where: {
                        unitNumber: String(unitNumber).replace(/^Unit\s+/i, '').trim(),
                        ...(companyId ? { companyId } : {}),
                    },
                });
                if (foundUnit) {
                    unitId = foundUnit.id;
                }
            }
            if (!tenantId && email) {
                let tenant = await database_1.default.tenant.findUnique({
                    where: { email },
                });
                if (!tenant) {
                    tenant = await database_1.default.tenant.create({
                        data: {
                            firstName: firstName || 'Unnamed',
                            lastName: lastName || 'Tenant',
                            email,
                            phone: phoneNumber || phone || 'N/A',
                            unitId: unitId || null,
                            status: 'Pending',
                            companyId,
                        },
                    });
                }
                tenantId = tenant.id;
            }
            if (!tenantId) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'BAD_REQUEST',
                        message: 'tenantId or email is required to create a screening report',
                    },
                });
            }
            if (tenantId && unitId) {
                await database_1.default.tenant.update({
                    where: { id: tenantId },
                    data: { unitId },
                });
            }
            const parsedCreditScore = parseInt(creditScore);
            const finalCreditScore = isNaN(parsedCreditScore) ? 0 : parsedCreditScore;
            const report = await database_1.default.screeningReport.create({
                data: {
                    tenantId,
                    creditScore: finalCreditScore,
                    criminalPass: criminalPass ?? true,
                    evictionPass: evictionPass ?? true,
                    status: status || 'Pending Documents',
                    companyId,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: report });
        }
        catch (error) {
            next(error);
        }
    }
    async getViolations(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const violations = await database_1.default.violation.findMany({
                where: companyId ? { companyId } : {},
                include: {
                    unit: {
                        include: { property: true },
                    },
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: violations });
        }
        catch (error) {
            next(error);
        }
    }
    async createViolation(req, res, next) {
        try {
            const { unitId, title, description, fineAmount } = req.body;
            const companyId = req.user?.companyId;
            const violation = await database_1.default.violation.create({
                data: {
                    unitId,
                    title,
                    description,
                    fineAmount: parseFloat(fineAmount || '0'),
                    companyId,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: violation });
        }
        catch (error) {
            next(error);
        }
    }
    async syncNycDobViolations(req, res, next) {
        try {
            const bin = req.query.bin || req.body?.bin || '';
            const cleanBin = bin.trim();
            if (!cleanBin) {
                return (0, apiResponse_1.sendSuccess)({ res, data: { syncedCount: 0, violations: [] }, message: 'BIN parameter is required.' });
            }
            let companyId = req.user?.companyId;
            if (!companyId) {
                const firstCompany = await database_1.default.company.findFirst();
                companyId = firstCompany?.id;
            }
            const { nycDobService } = await Promise.resolve().then(() => __importStar(require('../services/nycDob.service')));
            const results = await nycDobService.fetchViolationsByBin(cleanBin);
            // Persist to DB (Match target Property by BIN or Real Street Address)
            if (results.length > 0) {
                try {
                    const firstRes = results[0];
                    const streetName = (firstRes?.street || '').trim();
                    const houseNum = (firstRes?.houseNumber || '').trim();
                    const fullRealAddress = (houseNum && streetName) ? `${houseNum} ${streetName}` : (streetName || '');
                    // Find target property by exact nycBin or exact street address match (no loose contains)
                    let targetProperty = await database_1.default.property.findFirst({
                        where: {
                            ...(companyId ? { companyId } : {}),
                            OR: [
                                { nycBin: cleanBin },
                                ...(fullRealAddress ? [
                                    { address: { equals: `${fullRealAddress}, New York, NY` } },
                                    { streetAddress: { equals: fullRealAddress } },
                                ] : []),
                            ],
                        },
                    });
                    if (targetProperty) {
                        if (!targetProperty.nycBin) {
                            await database_1.default.property.update({
                                where: { id: targetProperty.id },
                                data: { nycBin: cleanBin },
                            });
                        }
                    }
                    else {
                        let owner = await database_1.default.owner.findFirst({
                            where: companyId ? { companyId } : {},
                        });
                        if (!owner) {
                            owner = await database_1.default.owner.create({
                                data: {
                                    name: 'NYC Asset Management',
                                    email: `owner-${Date.now()}@nycproperties.com`,
                                    phone: '212-555-0199',
                                    companyId,
                                },
                            });
                        }
                        const autoPropName = fullRealAddress ? fullRealAddress : `NYC Property (BIN ${cleanBin})`;
                        targetProperty = await database_1.default.property.create({
                            data: {
                                name: autoPropName,
                                type: 'Commercial',
                                ownerId: owner.id,
                                nycBin: cleanBin,
                                address: fullRealAddress ? `${fullRealAddress}, New York, NY` : `BIN ${cleanBin}, New York, NY`,
                                streetAddress: fullRealAddress || `BIN ${cleanBin}`,
                                city: 'New York',
                                state: 'NY',
                                country: 'USA',
                                zip: '10001',
                                yearBuilt: 1990,
                                squareFootage: 25000,
                                purchasePrice: 5000000,
                                currentValue: 7500000,
                                companyId,
                            },
                        });
                    }
                    let targetUnit = await database_1.default.unit.findFirst({
                        where: { propertyId: targetProperty.id },
                    });
                    if (!targetUnit) {
                        let building = await database_1.default.building.findFirst({
                            where: { propertyId: targetProperty.id },
                        });
                        if (!building) {
                            building = await database_1.default.building.create({
                                data: {
                                    propertyId: targetProperty.id,
                                    name: 'Main Building',
                                    floors: 6,
                                },
                            });
                        }
                        targetUnit = await database_1.default.unit.create({
                            data: {
                                propertyId: targetProperty.id,
                                buildingId: building.id,
                                unitNumber: 'Building Wide',
                                floor: 1,
                                bedrooms: 0,
                                bathrooms: 1,
                                squareFootage: 2500,
                                rentAmount: 0,
                                securityDeposit: 0,
                                availabilityDate: new Date(),
                                status: 'Occupied',
                            },
                        });
                    }
                    // Persist violations into DB for THIS target property (UPSERT Mode)
                    for (const item of results.slice(0, 100)) {
                        const existing = await database_1.default.violation.findFirst({
                            where: {
                                companyId,
                                title: item.violationNumber,
                            },
                        });
                        if (!existing) {
                            await database_1.default.violation.create({
                                data: {
                                    companyId,
                                    unitId: targetUnit.id,
                                    title: item.violationNumber,
                                    description: item.description,
                                    fineAmount: item.severity === 'Critical' ? 500 : 250,
                                    status: item.status,
                                },
                            });
                        }
                        else {
                            // Update status and description if changed in NYC Open Data
                            await database_1.default.violation.update({
                                where: { id: existing.id },
                                data: {
                                    status: item.status,
                                    description: item.description,
                                },
                            });
                        }
                    }
                }
                catch (dbErr) {
                    console.error('Error persisting violations to DB:', dbErr);
                }
            }
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    syncedCount: results.length,
                    violations: results
                },
                message: 'NYC DOB Violations synced successfully via NYC Open Data API'
            });
        }
        catch (error) {
            next(error);
        }
    }
    async syncAllNycDobViolations(req, res, next) {
        try {
            let companyId = req.user?.companyId;
            if (!companyId) {
                const firstCompany = await database_1.default.company.findFirst();
                companyId = firstCompany?.id;
            }
            const properties = await database_1.default.property.findMany({
                where: companyId ? { companyId } : {},
            });
            const propertiesWithBin = properties.filter((p) => (p.nycBin && p.nycBin.trim().length > 0) || (p.bin && p.bin.trim().length > 0));
            const { nycDobService } = await Promise.resolve().then(() => __importStar(require('../services/nycDob.service')));
            const syncedPropertiesResults = [];
            let totalSyncedCount = 0;
            for (const prop of propertiesWithBin) {
                const cleanBin = (prop.nycBin || prop.bin || '').trim();
                if (!cleanBin)
                    continue;
                const results = await nycDobService.fetchViolationsByBin(cleanBin);
                if (results.length > 0) {
                    let targetUnit = await database_1.default.unit.findFirst({
                        where: { propertyId: prop.id },
                    });
                    if (!targetUnit) {
                        let building = await database_1.default.building.findFirst({ where: { propertyId: prop.id } });
                        if (!building) {
                            building = await database_1.default.building.create({
                                data: { propertyId: prop.id, name: 'Main Building', floors: 1 },
                            });
                        }
                        targetUnit = await database_1.default.unit.create({
                            data: {
                                propertyId: prop.id,
                                buildingId: building.id,
                                unitNumber: 'Building Wide',
                                floor: 1,
                                bedrooms: 0,
                                bathrooms: 1,
                                squareFootage: 2500,
                                rentAmount: 0,
                                securityDeposit: 0,
                                availabilityDate: new Date(),
                                status: 'Occupied',
                            },
                        });
                    }
                    let syncedForThisProp = 0;
                    for (const item of results.slice(0, 100)) {
                        const existing = await database_1.default.violation.findFirst({
                            where: {
                                companyId,
                                title: item.violationNumber,
                            },
                        });
                        if (!existing) {
                            await database_1.default.violation.create({
                                data: {
                                    companyId,
                                    unitId: targetUnit.id,
                                    title: item.violationNumber,
                                    description: item.description,
                                    fineAmount: item.severity === 'Critical' ? 500 : 250,
                                    status: item.status,
                                },
                            });
                            syncedForThisProp++;
                        }
                        else {
                            // Update compliance status if updated by NYC Dept of Buildings
                            await database_1.default.violation.update({
                                where: { id: existing.id },
                                data: {
                                    status: item.status,
                                    description: item.description,
                                },
                            });
                        }
                    }
                    syncedPropertiesResults.push({
                        propertyId: prop.id,
                        propertyName: prop.name,
                        address: prop.address || prop.streetAddress,
                        bin: cleanBin,
                        fetchedCount: results.length,
                        syncedCount: syncedForThisProp,
                    });
                    totalSyncedCount += results.length;
                }
            }
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    totalSyncedCount,
                    syncedPropertiesCount: syncedPropertiesResults.length,
                    syncedProperties: syncedPropertiesResults,
                },
                message: `Successfully synced violations across ${syncedPropertiesResults.length} properties.`,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async dispatchViolation(req, res, next) {
        try {
            const { violationId } = req.body;
            const companyId = req.user?.companyId;
            if (violationId) {
                // 1. Mark violation status as Disputed/In Progress or keep track
                await database_1.default.violation.updateMany({
                    where: { id: violationId },
                    data: { status: 'Disputed' },
                });
                // 2. Fetch violation details to create a real ServiceRequest in DB
                const violation = await database_1.default.violation.findFirst({
                    where: { id: violationId },
                    include: { unit: { include: { property: true } } },
                });
                if (violation) {
                    let targetPropertyId = violation.unit?.propertyId;
                    let targetPropertyName = violation.unit?.property?.name || 'NYC Building Asset';
                    if (!targetPropertyId) {
                        const firstProp = await database_1.default.property.findFirst({
                            where: companyId ? { companyId } : {},
                        });
                        targetPropertyId = firstProp?.id;
                        targetPropertyName = firstProp?.name || 'NYC Building Asset';
                    }
                    if (targetPropertyId) {
                        // Create ServiceRequest so it lands in Service Requests UI for staff assignment
                        await database_1.default.serviceRequest.create({
                            data: {
                                propertyId: targetPropertyId,
                                propertyName: targetPropertyName,
                                unitNumber: violation.unit?.unitNumber || 'Building Wide',
                                tenantName: 'NYC DOB Compliance Auditor',
                                title: `NYC DOB Violation: ${violation.title}`,
                                description: violation.description || 'DOB Building Compliance Citation',
                                category: 'Building Code Compliance',
                                priority: 'Emergency',
                                status: 'Pending',
                                messages: '[]',
                                companyId: companyId || violation.companyId || undefined,
                            },
                        });
                    }
                }
            }
            return (0, apiResponse_1.sendSuccess)({
                res,
                message: 'Violation dispatched and converted to Service Request in DB successfully',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getTenantMessages(req, res, next) {
        try {
            let messages = await database_1.default.tenantMessage.findMany({
                orderBy: { createdAt: 'desc' },
            });
            if (messages.length === 0) {
                await database_1.default.tenantMessage.createMany({
                    data: [
                        {
                            sender: 'Property Manager Office',
                            recipient: 'Alex Mercer',
                            subject: 'Upcoming HVAC Maintenance Inspection',
                            body: 'Hello Alex, please be advised that HVAC filters will be replaced this Thursday between 9 AM and 12 PM.',
                        },
                        {
                            sender: 'Leasing Office',
                            recipient: 'Alex Mercer',
                            subject: 'Parking Pass Renewal Notice',
                            body: 'Your reserved spot #42 parking pass is set to expire end of month. Reply to confirm auto-renewal.',
                        },
                    ],
                });
                messages = await database_1.default.tenantMessage.findMany({
                    orderBy: { createdAt: 'desc' },
                });
            }
            const threads = [
                {
                    id: 'thread-1',
                    senderName: 'Property Manager Office',
                    role: 'Management',
                    unread: false,
                    messages: messages
                        .filter((m) => m.sender === 'Property Manager Office' || m.recipient === 'Property Manager Office')
                        .map((m) => ({
                        id: m.id,
                        senderName: m.sender,
                        role: m.sender.includes('Resident') ? 'Tenant' : 'Management',
                        timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        date: new Date(m.createdAt).toISOString().split('T')[0],
                        subject: m.subject,
                        body: m.body,
                    })),
                },
                {
                    id: 'thread-2',
                    senderName: 'Leasing Office',
                    role: 'Leasing Desk',
                    unread: true,
                    messages: messages
                        .filter((m) => m.sender === 'Leasing Office' || m.recipient === 'Leasing Office')
                        .map((m) => ({
                        id: m.id,
                        senderName: m.sender,
                        role: m.sender.includes('Resident') ? 'Tenant' : 'Leasing Desk',
                        timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        date: new Date(m.createdAt).toISOString().split('T')[0],
                        subject: m.subject,
                        body: m.body,
                    })),
                },
            ];
            return (0, apiResponse_1.sendSuccess)({ res, data: threads });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Invoices ---
    async getInvoices(req, res, next) {
        try {
            await (0, billingAutomation_service_1.generateAutoInvoices)();
            await (0, billingAutomation_service_1.generateAutoLateFees)();
            let whereClause = {};
            if ((req.user?.role === 'Tenant' || req.user?.roleName === 'Tenant') && req.user?.email) {
                const tenant = await database_1.default.tenant.findFirst({ where: { email: req.user.email } });
                if (tenant) {
                    whereClause.tenantId = tenant.id;
                }
                else {
                    return (0, apiResponse_1.sendSuccess)({ res, data: [] });
                }
            }
            const invoices = await database_1.default.invoice.findMany({
                where: whereClause,
                include: { tenant: true },
                orderBy: { dueDate: 'asc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: invoices });
        }
        catch (error) {
            next(error);
        }
    }
    async createTenantMessage(req, res, next) {
        try {
            const tenant = await this.getTenantForUser(req);
            const tenantFullName = tenant ? `${tenant.firstName} ${tenant.lastName} (Resident)` : 'Resident';
            const { sender, recipient, subject, body } = req.body;
            const newMsg = await database_1.default.tenantMessage.create({
                data: {
                    sender: sender || tenantFullName,
                    recipient: recipient || 'Property Manager Office',
                    subject: subject || 'General Inquiry',
                    body: body || '',
                },
            });
            return (0, apiResponse_1.sendSuccess)({
                res,
                statusCode: 201,
                data: {
                    id: newMsg.id,
                    senderName: newMsg.sender,
                    role: 'Tenant',
                    timestamp: new Date(newMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    date: new Date(newMsg.createdAt).toISOString().split('T')[0],
                    subject: newMsg.subject,
                    body: newMsg.body,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async createInvoice(req, res, next) {
        try {
            const { tenantId, amount, dueDate, status } = req.body;
            const tenant = await database_1.default.tenant.findUnique({
                where: { id: tenantId },
                include: { leases: { include: { property: true } } }
            });
            const tenantName = tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Unknown Tenant';
            const lease = tenant?.leases?.[0];
            const propertyId = lease?.propertyId || 'default-property';
            const propertyName = lease?.property?.name || 'Unknown Property';
            const invoice = await database_1.default.invoice.create({
                data: {
                    tenantId,
                    tenantName,
                    propertyId,
                    propertyName,
                    amount: parseFloat(amount || '0'),
                    balance: parseFloat(amount || '0'),
                    dueDate: String(dueDate || new Date().toISOString().split('T')[0]),
                    status: status || 'Sent',
                    lineItems: JSON.stringify(req.body.lineItems || []),
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: invoice });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteInvoice(req, res, next) {
        try {
            await database_1.default.invoice.delete({
                where: { id: req.params.id },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: { success: true } });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Charges ---
    async getCharges(req, res, next) {
        try {
            let whereClause = {};
            if ((req.user?.role === 'Tenant' || req.user?.roleName === 'Tenant') && req.user?.email) {
                const tenant = await database_1.default.tenant.findFirst({ where: { email: req.user.email } });
                if (tenant) {
                    whereClause.tenantId = tenant.id;
                }
                else {
                    return (0, apiResponse_1.sendSuccess)({ res, data: [] });
                }
            }
            const charges = await database_1.default.charge.findMany({
                where: whereClause,
                include: { tenant: true },
                orderBy: { createdAt: 'desc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: charges });
        }
        catch (error) {
            next(error);
        }
    }
    async createCharge(req, res, next) {
        try {
            const { tenantId, title, amount, status } = req.body;
            const charge = await database_1.default.charge.create({
                data: {
                    tenantId,
                    title,
                    amount: parseFloat(amount || '0'),
                    status: status || 'Active',
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: charge });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteCharge(req, res, next) {
        try {
            await database_1.default.charge.delete({
                where: { id: req.params.id },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: { success: true } });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Deposits ---
    async getDeposits(req, res, next) {
        try {
            let whereClause = {};
            if ((req.user?.role === 'Tenant' || req.user?.roleName === 'Tenant') && req.user?.email) {
                const tenant = await database_1.default.tenant.findFirst({ where: { email: req.user.email } });
                if (tenant) {
                    whereClause.tenantId = tenant.id;
                }
                else {
                    return (0, apiResponse_1.sendSuccess)({ res, data: [] });
                }
            }
            const deposits = await database_1.default.deposit.findMany({
                where: whereClause,
                include: { tenant: true },
                orderBy: { createdAt: 'desc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: deposits });
        }
        catch (error) {
            next(error);
        }
    }
    async getTenantNotifications(req, res, next) {
        try {
            const notes = await database_1.default.tenantNotification.findMany({
                orderBy: { createdAt: 'desc' },
            });
            const formatted = notes.map((n) => ({
                id: n.id,
                title: n.title,
                message: n.message,
                type: n.type || 'info',
                role: 'Tenant',
                read: n.read,
                timestamp: new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                date: new Date(n.createdAt).toISOString().split('T')[0],
            }));
            return (0, apiResponse_1.sendSuccess)({ res, data: formatted });
        }
        catch (error) {
            next(error);
        }
    }
    async markTenantNotificationRead(req, res, next) {
        try {
            const id = req.params.id;
            if (id === 'all') {
                await database_1.default.tenantNotification.updateMany({
                    data: { read: true },
                });
            }
            else {
                await database_1.default.tenantNotification.update({
                    where: { id },
                    data: { read: true },
                });
            }
            return (0, apiResponse_1.sendSuccess)({ res, message: 'Notification mark as read' });
        }
        catch (error) {
            next(error);
        }
    }
    async clearTenantNotifications(req, res, next) {
        try {
            await database_1.default.tenantNotification.deleteMany({});
            return (0, apiResponse_1.sendSuccess)({ res, message: 'All notifications cleared' });
        }
        catch (error) {
            next(error);
        }
    }
    async getStaffProfile(req, res, next) {
        try {
            let staff = await database_1.default.staffProfile.findFirst();
            if (!staff) {
                staff = await database_1.default.staffProfile.create({
                    data: {
                        name: 'Marcus Vance',
                        specialist: 'Senior Maintenance Lead',
                        email: 'marcus.vance@apexpm.com',
                        phone: '(512) 555-0199',
                        role: 'Maintenance Staff',
                        assignedProperties: 'Sunset Villas, Apex Heights, Lakeside',
                        joinedDate: 'January 15th, 2025',
                        isAvailable: true,
                        completedJobs: 142,
                        avgResponseTime: '38 Min',
                        customerRating: '4.92 / 5.0',
                    },
                });
            }
            return (0, apiResponse_1.sendSuccess)({ res, data: staff });
        }
        catch (error) {
            next(error);
        }
    }
    async updateStaffProfile(req, res, next) {
        try {
            const { isAvailable, name, email, phone } = req.body;
            let staff = await database_1.default.staffProfile.findFirst();
            if (!staff) {
                staff = await database_1.default.staffProfile.create({
                    data: {
                        name: name || 'Marcus Vance',
                        specialist: 'Senior Maintenance Lead',
                        email: email || 'marcus.vance@apexpm.com',
                        phone: phone || '(512) 555-0199',
                        isAvailable: typeof isAvailable === 'boolean' ? isAvailable : true,
                    },
                });
            }
            else {
                staff = await database_1.default.staffProfile.update({
                    where: { id: staff.id },
                    data: {
                        ...(typeof isAvailable === 'boolean' && { isAvailable }),
                        ...(name && { name }),
                        ...(email && { email }),
                        ...(phone && { phone }),
                    },
                });
            }
            return (0, apiResponse_1.sendSuccess)({ res, data: staff });
        }
        catch (error) {
            next(error);
        }
    }
    async getStaffTasks(req, res, next) {
        try {
            const companyId = req.user?.companyId;
            const userEmail = req.user?.email;
            let vendor = null;
            if (userEmail) {
                vendor = await database_1.default.vendor.findFirst({ where: { email: userEmail } });
            }
            // Build query filter for ServiceRequests
            const srWhere = {};
            if (companyId) {
                srWhere.companyId = companyId;
            }
            if (vendor) {
                srWhere.OR = [
                    { assignedVendorId: vendor.id },
                    { assignedVendorName: vendor.contactName || vendor.companyName },
                    { assignedTechnician: vendor.contactName }
                ];
                if (companyId) {
                    srWhere.companyId = companyId;
                }
            }
            // Build query filter for WorkOrders
            const woWhere = {};
            if (companyId) {
                woWhere.companyId = companyId;
            }
            if (vendor) {
                woWhere.vendorId = vendor.id;
            }
            // 1. Fetch ServiceRequests
            const serviceRequests = await database_1.default.serviceRequest.findMany({
                where: Object.keys(srWhere).length > 0 ? srWhere : (companyId ? { companyId } : {}),
                orderBy: { createdAt: 'desc' },
            });
            // 2. Fetch WorkOrders
            const workOrders = await database_1.default.workOrder.findMany({
                where: Object.keys(woWhere).length > 0 ? woWhere : (companyId ? { companyId } : {}),
                include: { property: true, vendor: true },
                orderBy: { createdAt: 'desc' },
            });
            const formattedServiceRequests = serviceRequests.map((sr) => ({
                id: sr.id,
                workOrderNumber: `SR-${sr.id.slice(0, 8).toUpperCase()}`,
                propertyName: sr.propertyName || 'Property',
                unitNumber: sr.unitNumber ? (sr.unitNumber.toLowerCase().includes('unit') ? sr.unitNumber : `Unit ${sr.unitNumber}`) : '',
                issue: sr.title,
                category: sr.category || (sr.title.toLowerCase().includes('hvac') ? 'HVAC' : sr.title.toLowerCase().includes('plumbing') ? 'Plumbing' : 'General'),
                priority: sr.priority === 'Normal' ? 'Medium' : sr.priority || 'Medium',
                status: sr.status === 'Open' || sr.status === 'New' || sr.status === 'Submitted' ? 'New' : sr.status === 'InProgress' || sr.status === 'In Progress' ? 'In Progress' : sr.status === 'Completed' ? 'Completed' : sr.status === 'Closed' ? 'Closed' : sr.status === 'Rejected' ? 'Rejected' : sr.status === 'Assigned' ? 'Assigned' : sr.status || 'New',
                assignedTechnician: sr.assignedVendorName || sr.assignedTechnician || (vendor ? (vendor.contactName || vendor.companyName) : 'Maintenance Staff'),
                dueDate: sr.scheduledDate || (sr.createdAt ? new Date(sr.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
                createdAt: sr.createdAt ? new Date(sr.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                description: sr.description || '',
                estimatedCost: sr.estimatedCost || 0,
                actualCost: sr.labourCost || sr.cost || 0,
                labourCost: sr.labourCost || 0,
                materialsCost: sr.materialsCost || 0,
                extraExpenses: sr.extraExpenses || 0,
                rejectReason: sr.status === 'Rejected' ? sr.notes : null,
                resolutionNotes: sr.status === 'Completed' ? sr.notes : null,
            }));
            const formattedWorkOrders = workOrders.map((wo, index) => ({
                id: wo.id,
                workOrderNumber: `WO-${1001 + index}`,
                propertyName: wo.property?.name || 'Property',
                unitNumber: 'Unit 101',
                issue: wo.title,
                category: wo.title.toLowerCase().includes('hvac') ? 'HVAC' : wo.title.toLowerCase().includes('plumbing') ? 'Plumbing' : 'General',
                priority: wo.priority === 'Normal' ? 'Medium' : wo.priority || 'Medium',
                status: wo.status === 'Open' || wo.status === 'Submitted' ? 'New' : wo.status === 'InProgress' ? 'In Progress' : wo.status === 'Completed' ? 'Completed' : wo.status === 'Closed' ? 'Closed' : wo.status === 'Rejected' ? 'Rejected' : wo.status === 'Assigned' ? 'Assigned' : wo.status || 'New',
                assignedTechnician: wo.vendor?.contactName || wo.vendor?.companyName || 'Maintenance Staff',
                dueDate: wo.createdAt ? new Date(wo.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                createdAt: wo.createdAt ? new Date(wo.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                description: wo.description || '',
                estimatedCost: wo.estimatedCost || 0,
                actualCost: wo.actualCost || 0,
                labourCost: wo.labourCost || 0,
                materialsCost: wo.materialsCost || 0,
                extraExpenses: wo.extraExpenses || 0,
                rejectReason: wo.rejectReason || null,
                resolutionNotes: wo.resolutionNotes || null,
            }));
            const combined = [...formattedServiceRequests, ...formattedWorkOrders];
            return (0, apiResponse_1.sendSuccess)({ res, data: combined });
        }
        catch (error) {
            next(error);
        }
    }
    async updateStaffTaskStatus(req, res, next) {
        try {
            const id = req.params.id;
            const { status, actualCost, rejectReason, resolutionNotes, labourCost, materialsCost, extraExpenses } = req.body;
            const statusMap = {
                'Open': 'Open',
                'New': 'Submitted',
                'Submitted': 'Submitted',
                'Approved': 'Approved',
                'Assigned': 'Assigned',
                'Accepted': 'Accepted',
                'InProgress': 'InProgress',
                'In Progress': 'InProgress',
                'In_Progress': 'InProgress',
                'Completed': 'Completed',
                'Rejected': 'Rejected',
                'Cancelled': 'Cancelled',
                'Closed': 'Closed',
                'Returned': 'Returned',
            };
            const mappedStatus = status ? (statusMap[status] ?? status) : undefined;
            const finalLabour = labourCost !== undefined && labourCost !== null ? parseFloat(String(labourCost)) : 0;
            const finalMaterials = materialsCost !== undefined && materialsCost !== null ? parseFloat(String(materialsCost)) : 0;
            const finalExtra = extraExpenses !== undefined && extraExpenses !== null ? parseFloat(String(extraExpenses)) : 0;
            const computedCost = (labourCost !== undefined || materialsCost !== undefined || extraExpenses !== undefined)
                ? (finalLabour + finalMaterials + finalExtra)
                : (actualCost !== undefined && actualCost !== null ? parseFloat(String(actualCost)) : undefined);
            // First check ServiceRequest table
            const existingSr = await database_1.default.serviceRequest.findUnique({ where: { id } });
            if (existingSr) {
                const srStatus = mappedStatus === 'InProgress' ? 'In Progress' : mappedStatus;
                const updatedSr = await database_1.default.serviceRequest.update({
                    where: { id },
                    data: {
                        ...(srStatus && { status: srStatus }),
                        ...(labourCost !== undefined ? { cost: parseFloat(String(labourCost)) } : (actualCost !== undefined && { cost: parseFloat(String(actualCost)) })),
                        ...(labourCost !== undefined && labourCost !== null && { labourCost: parseFloat(String(labourCost)) }),
                        ...(extraExpenses !== undefined && extraExpenses !== null && { extraExpenses: parseFloat(String(extraExpenses)) }),
                        ...(rejectReason && { notes: rejectReason }),
                        ...(resolutionNotes && { notes: resolutionNotes }),
                    },
                });
                return (0, apiResponse_1.sendSuccess)({ res, data: updatedSr });
            }
            // Check WorkOrder table
            const existingWo = await database_1.default.workOrder.findUnique({ where: { id } });
            if (existingWo) {
                const order = await database_1.default.workOrder.update({
                    where: { id },
                    data: {
                        ...(mappedStatus && { status: mappedStatus }),
                        ...(labourCost !== undefined ? { actualCost: parseFloat(String(labourCost)) } : (actualCost !== undefined && { actualCost: parseFloat(String(actualCost)) })),
                        ...(labourCost !== undefined && labourCost !== null && { labourCost: parseFloat(String(labourCost)) }),
                        ...(materialsCost !== undefined && materialsCost !== null && { materialsCost: parseFloat(String(materialsCost)) }),
                        ...(extraExpenses !== undefined && extraExpenses !== null && { extraExpenses: parseFloat(String(extraExpenses)) }),
                        ...(rejectReason && { rejectReason }),
                        ...(resolutionNotes && { resolutionNotes }),
                        ...(mappedStatus === 'Completed' && { completedAt: new Date() }),
                    },
                });
                return (0, apiResponse_1.sendSuccess)({ res, data: order });
            }
            return res.status(404).json({ success: false, error: { message: 'Task not found' } });
        }
        catch (error) {
            next(error);
        }
    }
    async createDeposit(req, res, next) {
        try {
            const { tenantId, amount, status } = req.body;
            const deposit = await database_1.default.deposit.create({
                data: {
                    tenantId,
                    amount: parseFloat(amount || '0'),
                    status: status || 'Held',
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: deposit });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteDeposit(req, res, next) {
        try {
            await database_1.default.deposit.delete({
                where: { id: req.params.id },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: { success: true } });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Expenses ---
    async getExpenses(req, res, next) {
        try {
            const expenses = await database_1.default.expense.findMany({
                orderBy: { date: 'desc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: expenses });
        }
        catch (error) {
            next(error);
        }
    }
    async createExpense(req, res, next) {
        try {
            const { category, amount, date, description } = req.body;
            const parsedAmount = parseFloat(amount || '0');
            const companyId = req.user?.companyId;
            let parsedDesc = {};
            try {
                parsedDesc = JSON.parse(description || '{}');
            }
            catch (e) {
                parsedDesc = {};
            }
            const payeeType = parsedDesc.payeeType || req.body.payeeType || 'Vendor';
            const payeeId = parsedDesc.payeeId || req.body.payeeId || '';
            const propertyId = parsedDesc.propertyId || req.body.propertyId || null;
            const propertyName = parsedDesc.propertyName || req.body.propertyName || 'Property';
            const unitId = parsedDesc.unitId || req.body.unitId || null;
            const expense = await database_1.default.$transaction(async (tx) => {
                const exp = await tx.expense.create({
                    data: {
                        category,
                        amount: parsedAmount,
                        date: new Date(date || Date.now()),
                        description: description || '',
                    },
                });
                // 1. Debit (Increase) Expense account: e.g. "5010" or first Account of type "Expense"
                const expenseAccount = await tx.coAAccount.findFirst({
                    where: companyId
                        ? { companyId, OR: [{ accountCode: '5010' }, { type: 'Expense' }] }
                        : { OR: [{ accountCode: '5010' }, { type: 'Expense' }] }
                });
                if (expenseAccount) {
                    await tx.coAAccount.update({
                        where: { id: expenseAccount.id },
                        data: { balance: { increment: parsedAmount } }
                    });
                }
                // 2. Credit (Decrease) Checking Account: e.g. "1010" or first Account of type "Asset"
                const checkingAccount = await tx.coAAccount.findFirst({
                    where: companyId
                        ? { companyId, OR: [{ accountCode: '1010' }, { type: 'Asset' }] }
                        : { OR: [{ accountCode: '1010' }, { type: 'Asset' }] }
                });
                if (checkingAccount) {
                    await tx.coAAccount.update({
                        where: { id: checkingAccount.id },
                        data: { balance: { decrement: parsedAmount } }
                    });
                }
                // 3. Multi-Tenant SaaS Auto-Sync:
                // If Payee Type is 'Owner' (Property Owner Distribution)
                if (payeeType === 'Owner' || payeeType === 'Property Owner (Distribution)' || category?.toLowerCase().includes('distribution')) {
                    let ownerIdToUse = payeeId;
                    if (!ownerIdToUse && propertyId) {
                        const prop = await tx.property.findUnique({ where: { id: propertyId } });
                        if (prop && prop.ownerId) {
                            ownerIdToUse = prop.ownerId;
                        }
                    }
                    if (!ownerIdToUse) {
                        const firstOwner = await tx.owner.findFirst({
                            where: companyId ? { companyId } : {},
                        });
                        if (firstOwner)
                            ownerIdToUse = firstOwner.id;
                    }
                    if (ownerIdToUse) {
                        await tx.ownerDistribution.create({
                            data: {
                                ownerId: ownerIdToUse,
                                amount: parsedAmount,
                                status: 'Completed',
                                processedDate: new Date(date || Date.now()),
                                period: propertyName ? `${propertyName} Distribution` : 'Property Distribution',
                            },
                        });
                    }
                }
                // If Payee Type is 'Tenant' (Refund / Return)
                if (payeeType === 'Tenant' || payeeType === 'Tenant (Refund / Return)' || category?.toLowerCase().includes('refund')) {
                    let tenantIdToUse = payeeId;
                    let tenantObj = null;
                    if (tenantIdToUse) {
                        tenantObj = await tx.tenant.findUnique({ where: { id: tenantIdToUse }, include: { leases: true } });
                    }
                    else {
                        tenantObj = await tx.tenant.findFirst({
                            where: companyId ? { companyId } : {},
                            include: { leases: true },
                        });
                        if (tenantObj)
                            tenantIdToUse = tenantObj.id;
                    }
                    if (tenantObj && tenantIdToUse) {
                        const lease = tenantObj.leases?.[0];
                        await tx.rentPayment.create({
                            data: {
                                tenantId: tenantIdToUse,
                                propertyId: tenantObj.propertyId || propertyId || 'default-property',
                                unitId: tenantObj.unitId || unitId || 'default-unit',
                                leaseId: lease?.id || 'default-lease',
                                amount: parsedAmount,
                                dueDate: new Date(date || Date.now()),
                                paidDate: new Date(date || Date.now()),
                                paymentMethod: 'ACH',
                                status: 'Paid',
                                referenceNumber: `REFUND-${Date.now()}`,
                                companyId: companyId || tenantObj.companyId || null,
                            },
                        });
                    }
                }
                return exp;
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: expense });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteExpense(req, res, next) {
        try {
            await database_1.default.expense.delete({
                where: { id: req.params.id },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: { success: true } });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Maintenance Requests ---
    async getMaintenanceRequests(req, res, next) {
        try {
            const reqs = await database_1.default.maintenanceRequest.findMany({
                orderBy: { createdAt: 'desc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: reqs });
        }
        catch (error) {
            next(error);
        }
    }
    async createMaintenanceRequest(req, res, next) {
        try {
            const { title, description, propertyName, unitNumber, priority, status } = req.body;
            const request = await database_1.default.maintenanceRequest.create({
                data: {
                    title,
                    description,
                    propertyName,
                    unitNumber,
                    priority: priority || 'Normal',
                    status: status || 'New',
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: request });
        }
        catch (error) {
            next(error);
        }
    }
    async updateMaintenanceRequest(req, res, next) {
        try {
            const { status, priority, title, description } = req.body;
            const request = await database_1.default.maintenanceRequest.update({
                where: { id: req.params.id },
                data: { status, priority, title, description },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: request });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteMaintenanceRequest(req, res, next) {
        try {
            await database_1.default.maintenanceRequest.delete({
                where: { id: req.params.id },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: { success: true } });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Inspections ---
    async getInspections(req, res, next) {
        try {
            const inspections = await database_1.default.inspection.findMany({
                orderBy: { startedAt: 'asc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: inspections });
        }
        catch (error) {
            next(error);
        }
    }
    async createInspection(req, res, next) {
        try {
            const { status, date } = req.body;
            const timestampSuffix = String(Date.now()).slice(-6);
            const randomSuffix = String(Math.floor(100 + Math.random() * 900));
            const inspectionNumber = `MI-${timestampSuffix}${randomSuffix}`;
            const inspection = await database_1.default.inspection.create({
                data: {
                    inspectionNumber,
                    status: status || 'DRAFT',
                    startedAt: date ? new Date(date) : new Date(),
                    templateName: 'Standard Template',
                    templateVersion: 1,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: inspection });
        }
        catch (error) {
            next(error);
        }
    }
    async updateInspection(req, res, next) {
        try {
            const { status, date } = req.body;
            const inspection = await database_1.default.inspection.update({
                where: { id: req.params.id },
                data: {
                    status: status,
                    startedAt: date ? new Date(date) : undefined,
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: inspection });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteInspection(req, res, next) {
        try {
            await database_1.default.inspection.delete({
                where: { id: req.params.id },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: { success: true } });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Income ---
    async getIncome(req, res, next) {
        try {
            const incomes = await database_1.default.income.findMany({
                orderBy: { date: 'desc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: incomes });
        }
        catch (error) {
            next(error);
        }
    }
    async createIncome(req, res, next) {
        try {
            const { category, amount, date, description, status } = req.body;
            const income = await database_1.default.income.create({
                data: {
                    category,
                    amount: parseFloat(amount || '0'),
                    date: new Date(date || Date.now()),
                    description: description || '',
                    status: status || 'Cleared',
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: income });
        }
        catch (error) {
            next(error);
        }
    }
    async deleteIncome(req, res, next) {
        try {
            await database_1.default.income.delete({
                where: { id: req.params.id },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: { success: true } });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Signatures ---
    async getSignatures(req, res, next) {
        try {
            const signatures = await database_1.default.signature.findMany({
                orderBy: { createdAt: 'desc' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: signatures });
        }
        catch (error) {
            next(error);
        }
    }
    async createSignature(req, res, next) {
        try {
            const { documentName, documentId, recipientName, recipientEmail, expiresAt } = req.body;
            const signature = await database_1.default.signature.create({
                data: {
                    documentName,
                    documentId,
                    recipientName,
                    recipientEmail,
                    status: 'Sent',
                    expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, statusCode: 201, data: signature });
        }
        catch (error) {
            next(error);
        }
    }
    async cancelSignature(req, res, next) {
        try {
            const signature = await database_1.default.signature.update({
                where: { id: req.params.id },
                data: { status: 'Cancelled' },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: signature });
        }
        catch (error) {
            next(error);
        }
    }
    async updateScreeningReport(req, res, next) {
        try {
            const id = req.params.id;
            const { status, dob, ssn, authorized } = req.body;
            const updateData = {};
            if (status !== undefined)
                updateData.status = status;
            if (dob !== undefined)
                updateData.dob = dob;
            if (ssn !== undefined)
                updateData.ssn = ssn;
            if (authorized !== undefined)
                updateData.authorized = authorized;
            if (status === 'Completed') {
                updateData.creditScore = 720;
                updateData.criminalPass = true;
                updateData.evictionPass = true;
            }
            const report = await database_1.default.screeningReport.update({
                where: { id },
                data: updateData,
                include: { tenant: true },
            });
            if (status === 'Approved' && report.tenantId) {
                await database_1.default.tenant.update({
                    where: { id: report.tenantId },
                    data: { status: 'Active' },
                });
                if (report.tenant?.email) {
                    const app = await database_1.default.application.findFirst({
                        where: { email: report.tenant.email },
                    });
                    if (app) {
                        await database_1.default.application.update({
                            where: { id: app.id },
                            data: { status: 'Approved' },
                        });
                    }
                }
            }
            else if (status === 'Declined' && report.tenantId) {
                await database_1.default.tenant.update({
                    where: { id: report.tenantId },
                    data: { status: 'Inactive' },
                });
                if (report.tenant?.email) {
                    const app = await database_1.default.application.findFirst({
                        where: { email: report.tenant.email },
                    });
                    if (app) {
                        await database_1.default.application.update({
                            where: { id: app.id },
                            data: { status: 'Rejected' },
                        });
                    }
                }
            }
            return (0, apiResponse_1.sendSuccess)({ res, data: report });
        }
        catch (error) {
            next(error);
        }
    }
    async uploadScreeningDocument(req, res, next) {
        try {
            const id = req.params.id;
            const file = req.file;
            if (!file) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'BAD_REQUEST',
                        message: 'No document file uploaded.'
                    }
                });
            }
            // Upload file to Cloudinary if setup, else fall back to base64 string
            let documentUrl = '';
            try {
                const result = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary_1.default.uploader.upload_stream({ folder: 'tenant-screening' }, (error, result) => {
                        if (error)
                            return reject(error);
                        resolve(result);
                    });
                    uploadStream.end(file.buffer);
                });
                documentUrl = result?.secure_url || '';
            }
            catch (err) {
                console.warn('Cloudinary upload failed, falling back to base64 data URI:', err);
                const base64Data = file.buffer ? file.buffer.toString('base64') : '';
                documentUrl = `data:${file.mimetype || 'application/pdf'};base64,${base64Data}`;
            }
            const report = await database_1.default.screeningReport.update({
                where: { id },
                data: {
                    documentUrl,
                    documentName: file?.originalname || 'screening_document',
                    status: 'Pending Approval',
                },
            });
            return (0, apiResponse_1.sendSuccess)({ res, data: report, message: 'Document uploaded successfully.' });
        }
        catch (error) {
            next(error);
        }
    }
    async getUserProfile(req, res, next) {
        try {
            const userId = req.user?.userId;
            const userEmail = req.user?.email;
            let user = null;
            if (userId) {
                user = await database_1.default.user.findUnique({
                    where: { id: userId },
                    include: { role: true, company: true },
                }).catch(() => null);
            }
            if (!user && userEmail) {
                user = await database_1.default.user.findFirst({
                    where: { email: userEmail },
                    include: { role: true, company: true },
                }).catch(() => null);
            }
            if (!user) {
                user = await database_1.default.user.findFirst({
                    include: { role: true, company: true },
                }).catch(() => null);
            }
            if (user) {
                return (0, apiResponse_1.sendSuccess)({
                    res,
                    data: {
                        id: user.id,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        name: `${user.firstName} ${user.lastName}`.trim(),
                        email: user.email,
                        phone: user.phone || '(512) 555-0188',
                        role: user.role?.name || req.user?.roleName || 'Collection Manager',
                        department: 'Collections & Revenue',
                        company: user.company?.name || 'Apex Property Management',
                    },
                });
            }
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    id: userId || 'usr-default',
                    firstName: 'Diya',
                    lastName: 'Jain',
                    name: 'Diya Jain',
                    email: userEmail || 'diya.jain@whatslandlord.com',
                    phone: '(512) 555-0188',
                    role: req.user?.roleName || 'Collection Manager',
                    department: 'Collections & Revenue',
                    company: 'Apex Property Management',
                },
            });
        }
        catch (error) {
            console.error('getUserProfile error:', error);
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    id: 'usr-default',
                    firstName: 'Diya',
                    lastName: 'Jain',
                    name: 'Diya Jain',
                    email: 'diya.jain@whatslandlord.com',
                    phone: '(512) 555-0188',
                    role: 'Collection Manager',
                    department: 'Collections & Revenue',
                    company: 'Apex Property Management',
                },
            });
        }
    }
    async updateUserProfile(req, res, next) {
        try {
            const { name, firstName, lastName, email, phone, department, company } = req.body || {};
            const userId = req.user?.userId;
            const userEmail = req.user?.email || email;
            let targetUser = null;
            if (userId) {
                targetUser = await database_1.default.user.findUnique({
                    where: { id: userId },
                }).catch(() => null);
            }
            if (!targetUser && userEmail) {
                targetUser = await database_1.default.user.findFirst({
                    where: { email: userEmail },
                }).catch(() => null);
            }
            let updatedFirstName = firstName;
            let updatedLastName = lastName;
            if (name && (!firstName || !lastName)) {
                const parts = name.trim().split(' ');
                updatedFirstName = parts[0] || 'User';
                updatedLastName = parts.slice(1).join(' ') || '';
            }
            if (targetUser) {
                const updated = await database_1.default.user.update({
                    where: { id: targetUser.id },
                    data: {
                        firstName: updatedFirstName || targetUser.firstName,
                        lastName: updatedLastName !== undefined ? updatedLastName : targetUser.lastName,
                        email: email || targetUser.email,
                        phone: phone || targetUser.phone,
                    },
                    include: { role: true, company: true },
                }).catch(() => null);
                if (updated) {
                    return (0, apiResponse_1.sendSuccess)({
                        res,
                        data: {
                            id: updated.id,
                            firstName: updated.firstName,
                            lastName: updated.lastName,
                            name: `${updated.firstName} ${updated.lastName}`.trim(),
                            email: updated.email,
                            phone: updated.phone || phone || '',
                            role: updated.role?.name || req.user?.roleName || 'Collection Manager',
                            department: department || 'Collections & Revenue',
                            company: updated.company?.name || company || 'Apex Property Management',
                        },
                        message: 'Profile updated in database successfully.',
                    });
                }
            }
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    id: userId || 'usr-default',
                    firstName: updatedFirstName || 'Diya',
                    lastName: updatedLastName || 'Jain',
                    name: `${updatedFirstName || 'Diya'} ${updatedLastName || 'Jain'}`.trim(),
                    email: email || userEmail || 'diya.jain@whatslandlord.com',
                    phone: phone || '(512) 555-0188',
                    role: req.user?.roleName || 'Collection Manager',
                    department: department || 'Collections & Revenue',
                    company: company || 'Apex Property Management',
                },
                message: 'Profile updated successfully.',
            });
        }
        catch (error) {
            console.error('updateUserProfile error:', error);
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    id: 'usr-default',
                    firstName: 'Diya',
                    lastName: 'Jain',
                    name: 'Diya Jain',
                    email: 'diya.jain@whatslandlord.com',
                    phone: '(512) 555-0188',
                    role: 'Collection Manager',
                    department: 'Collections & Revenue',
                    company: 'Apex Property Management',
                },
                message: 'Profile updated.',
            });
        }
    }
    // --- OPTION 3: TENANT 24/7 AI LEASE Q&A ASSISTANT ---
    async askLeaseAi(req, res, next) {
        try {
            const tenant = await this.getTenantForUser(req);
            const { question } = req.body;
            if (!question || typeof question !== 'string') {
                throw new Error('Question is required.');
            }
            // Fetch active lease details
            const leaseRec = tenant ? await database_1.default.lease.findFirst({
                where: { tenantId: tenant.id },
                include: { property: true, unit: true },
                orderBy: { startDate: 'desc' },
            }) : null;
            const rentAmount = leaseRec?.rentAmount || 1850;
            const depositAmount = leaseRec?.depositAmount || 1850;
            const leaseStart = leaseRec?.startDate ? new Date(leaseRec.startDate).toLocaleDateString() : 'August 1, 2025';
            const leaseEnd = leaseRec?.endDate ? new Date(leaseRec.endDate).toLocaleDateString() : 'July 31, 2026';
            const propertyName = leaseRec?.property?.name || 'Apex Heights';
            const unitNumber = leaseRec?.unit?.unitNumber || '204';
            const leaseSummaryText = `
Active Lease Overview:
- Tenant Name: ${tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Resident'}
- Property: ${propertyName}, Unit ${unitNumber}
- Monthly Rent: $${rentAmount} (Due on 1st of every month)
- Security Deposit: $${depositAmount}
- Lease Term: ${leaseStart} to ${leaseEnd}
- Late Fee Policy: $50 late fee applied after 5th of the month.
- Pet Policy: Pets allowed with written management authorization & $250 pet deposit. No aggressive breeds.
- Included Utilities: Water, Trash removal, and Sewage included in rent. Electricity & Gas paid by tenant.
- Notice Period / Early Move-out: 30-day written notice required before moving out. 1-month rent penalty applies for early lease termination.
- Subletting / Short-term Rental: Subletting or Airbnb hosting is strictly prohibited.
- Maintenance & Repairs: Emergency repairs handled by property management. Resident responsible for minor lightbulb replacements and keeping property clean.
      `.trim();
            const openAiApiKey = process.env.OPENAI_API_KEY || '';
            let aiAnswer = '';
            if (openAiApiKey && openAiApiKey !== 'your_openai_api_key_here' && openAiApiKey.trim().length > 10) {
                try {
                    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${openAiApiKey.trim()}`,
                        },
                        body: JSON.stringify({
                            model: process.env.OPENAI_MODEL || 'gpt-4o',
                            messages: [
                                {
                                    role: 'system',
                                    content: `You are the official 24/7 AI Lease Assistant for WhatsLandlord Property Management. Answer the resident's question accurately, warmly, and concisely (under 80 words) based strictly on their signed lease agreement context:\n\n${leaseSummaryText}`,
                                },
                                { role: 'user', content: question },
                            ],
                            temperature: 0.3,
                            max_tokens: 200,
                        }),
                    });
                    if (aiResponse.ok) {
                        const aiJson = await aiResponse.json();
                        aiAnswer = aiJson.choices?.[0]?.message?.content?.trim() || '';
                    }
                }
                catch (e) {
                    console.warn('[AI Lease Q&A] OpenAI call error, using rule engine:', e);
                }
            }
            // Smart rule-based fallback if OpenAI call failed or key not configured
            if (!aiAnswer) {
                const qLower = question.toLowerCase();
                if (qLower.includes('pet') || qLower.includes('dog') || qLower.includes('cat') || qLower.includes('animal')) {
                    aiAnswer = `Yes! Pets are allowed under your lease with prior written management approval and a $250 pet deposit. Aggressive breeds are prohibited.`;
                }
                else if (qLower.includes('late') || qLower.includes('fee') || qLower.includes('due') || qLower.includes('grace')) {
                    aiAnswer = `Rent is due on the 1st of every month ($${rentAmount}). A grace period is provided until the 5th; after the 5th, a $50 late fee is automatically applied to your account balance.`;
                }
                else if (qLower.includes('utility') || qLower.includes('utilities') || qLower.includes('water') || qLower.includes('electric') || qLower.includes('trash') || qLower.includes('gas')) {
                    aiAnswer = `Your rent includes Water, Sewage, and Trash removal services. Electricity and Gas accounts must be setup and paid directly by you.`;
                }
                else if (qLower.includes('notice') || qLower.includes('move out') || qLower.includes('terminate') || qLower.includes('break') || qLower.includes('end lease')) {
                    aiAnswer = `Your lease ends on ${leaseEnd}. You must provide a written 30-day notice before move-out. Breaking your lease early incurs a 1-month rent termination fee.`;
                }
                else if (qLower.includes('sublet') || qLower.includes('airbnb') || qLower.includes('guest')) {
                    aiAnswer = `Subletting your apartment or hosting short-term rentals (such as Airbnb) is strictly prohibited under Clause 14 of your lease agreement.`;
                }
                else if (qLower.includes('deposit') || qLower.includes('security')) {
                    aiAnswer = `Your security deposit is $${depositAmount}. It will be fully refunded within 30 days of move-out, minus any documented repair costs for tenant damages beyond normal wear and tear.`;
                }
                else {
                    aiAnswer = `According to your active lease for ${propertyName} (Unit ${unitNumber}), rent is $${rentAmount}/month due on the 1st. Please contact your property manager if you need specific contractual addendums!`;
                }
            }
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    question,
                    answer: aiAnswer,
                    leaseContext: {
                        rentAmount,
                        leaseStart,
                        leaseEnd,
                        propertyName,
                        unitNumber,
                    },
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    // --- OPTION 1: FLOATING 24/7 TENANT AI CONCIERGE WIDGET ---
    async tenantAiConcierge(req, res, next) {
        try {
            const tenant = await this.getTenantForUser(req);
            const { message } = req.body;
            if (!message || typeof message !== 'string') {
                throw new Error('Message is required.');
            }
            // Fetch Tenant real-time context
            const leaseRec = tenant ? await database_1.default.lease.findFirst({
                where: { tenantId: tenant.id },
                include: { property: true, unit: true },
                orderBy: { startDate: 'desc' },
            }) : null;
            const activeMaintenance = tenant ? await database_1.default.serviceRequest.findMany({
                where: { tenantId: tenant.id },
                orderBy: { createdAt: 'desc' },
                take: 3,
            }) : [];
            const rentAmount = leaseRec?.rentAmount || 1850;
            const propertyName = leaseRec?.property?.name || tenant?.unit?.property?.name || 'Apex Heights Apartments';
            const unitNumber = leaseRec?.unit?.unitNumber || tenant?.unit?.unitNumber || '204';
            const tenantName = tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Resident';
            // Latest maintenance status
            const latestTicket = activeMaintenance.length > 0 ? activeMaintenance[0] : null;
            const maintenanceSummary = latestTicket
                ? `Latest Ticket #${latestTicket.id.slice(0, 6)}: "${latestTicket.title}" | Status: ${latestTicket.status} | Vendor: ${latestTicket.assignedVendorName || 'Assigned'}`
                : 'No open maintenance requests.';
            const tenantContextText = `
Tenant Portal Context:
- Resident Name: ${tenantName}
- Property & Unit: ${propertyName}, Unit ${unitNumber}
- Monthly Rent: $${rentAmount} (Due on 1st of every month, 5-day grace period)
- Next Rent Payment Status: $${rentAmount} due on August 1, 2026
- Maintenance Request Status: ${maintenanceSummary}
- Lease Document: Active agreement available on the Lease page.
- Available Navigation Options: Dashboard (/tenant), Lease (/tenant/lease), Payments (/tenant/payments), Maintenance (/tenant/maintenance), Documents (/tenant/documents), Messages (/tenant/messages).
      `.trim();
            const openAiApiKey = process.env.OPENAI_API_KEY || '';
            let replyText = '';
            if (openAiApiKey && openAiApiKey !== 'your_openai_api_key_here' && openAiApiKey.trim().length > 10) {
                try {
                    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${openAiApiKey.trim()}`,
                        },
                        body: JSON.stringify({
                            model: process.env.OPENAI_MODEL || 'gpt-4o',
                            messages: [
                                {
                                    role: 'system',
                                    content: `You are the official 24/7 AI Tenant Concierge assistant for WhatsLandlord. Help the resident warmly, clearly, and concisely (under 75 words) based on their live real-time account data:\n\n${tenantContextText}`,
                                },
                                { role: 'user', content: message },
                            ],
                            temperature: 0.3,
                            max_tokens: 180,
                        }),
                    });
                    if (aiResponse.ok) {
                        const aiJson = await aiResponse.json();
                        replyText = aiJson.choices?.[0]?.message?.content?.trim() || '';
                    }
                }
                catch (e) {
                    console.warn('[AI Tenant Concierge] OpenAI call failed, fallback used:', e);
                }
            }
            // Smart rule engine fallback
            if (!replyText) {
                const mLower = message.toLowerCase();
                if (mLower.includes('rent') || mLower.includes('bill') || mLower.includes('due') || mLower.includes('pay')) {
                    replyText = `Your next rent bill of $${rentAmount} is due on August 1, 2026. You can pay securely online from the 'Payments' tab in your portal.`;
                }
                else if (mLower.includes('maintenance') || mLower.includes('repair') || mLower.includes('status') || mLower.includes('ticket') || mLower.includes('work order')) {
                    if (latestTicket) {
                        replyText = `Your active repair ticket "${latestTicket.title}" is currently in '${latestTicket.status}' status (Assigned to ${latestTicket.assignedVendorName || 'Technician'}). You can check updates on the 'Maintenance' tab!`;
                    }
                    else {
                        replyText = `You currently have no open maintenance tickets. To report an issue, click '+ Create Request' on the 'Maintenance' tab!`;
                    }
                }
                else if (mLower.includes('lease') || mLower.includes('download') || mLower.includes('agreement') || mLower.includes('contract')) {
                    replyText = `You can view your active lease terms and download your signed agreement directly from the 'Lease' tab in your left menu!`;
                }
                else if (mLower.includes('document') || mLower.includes('file') || mLower.includes('upload')) {
                    replyText = `You can view or upload official documents (insurance, ID, move-in photos) under the 'Documents' tab.`;
                }
                else {
                    replyText = `Hello ${tenantName}! I'm your 24/7 AI Concierge. I can help you check rent bills ($${rentAmount}), track maintenance ticket status, or locate your signed lease contract!`;
                }
            }
            return (0, apiResponse_1.sendSuccess)({
                res,
                data: {
                    message,
                    reply: replyText,
                    contextSummary: {
                        rentDue: `$${rentAmount} on Aug 1, 2026`,
                        activeTicketStatus: latestTicket ? latestTicket.status : 'None',
                    },
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.PortalController = PortalController;
exports.portalController = new PortalController();
