"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAutoInvoices = generateAutoInvoices;
exports.generateAutoLateFees = generateAutoLateFees;
const database_1 = __importDefault(require("../config/database"));
async function generateAutoInvoices() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Fetch active leases that have already started
        const activeLeases = await database_1.default.lease.findMany({
            where: {
                status: 'Active',
                startDate: { lte: today },
            },
            include: {
                tenant: true,
                property: true,
                unit: true,
            },
        });
        for (const lease of activeLeases) {
            const start = new Date(lease.startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(lease.endDate);
            end.setHours(23, 59, 59, 999);
            // Verify today is not past lease end date
            const limitDate = today < end ? today : end;
            let elapsedMonths = 0;
            let currentBillingDate = new Date(start);
            while (currentBillingDate <= limitDate) {
                const billingDateStr = currentBillingDate.toISOString().split('T')[0];
                // Check if we already have a Rent Charge invoice for this tenant on this specific billing date
                const existingInvoice = await database_1.default.invoice.findFirst({
                    where: {
                        tenantId: lease.tenantId,
                        dueDate: billingDateStr,
                        lineItems: {
                            contains: 'Rent Charge',
                        },
                    },
                });
                if (!existingInvoice) {
                    const tenantName = `${lease.tenant.firstName} ${lease.tenant.lastName}`;
                    const lineItems = [
                        { description: 'Rent Charge', amount: lease.rentAmount },
                    ];
                    await database_1.default.invoice.create({
                        data: {
                            tenantId: lease.tenantId,
                            tenantName,
                            propertyId: lease.propertyId,
                            propertyName: lease.property.name,
                            unitNumber: lease.unit.unitNumber,
                            dueDate: billingDateStr,
                            amount: lease.rentAmount,
                            balance: lease.rentAmount,
                            paidAmount: 0,
                            status: 'Sent',
                            lineItems: JSON.stringify(lineItems),
                            notes: `Auto-generated rent invoice for billing cycle starting ${billingDateStr}`,
                            companyId: lease.companyId,
                        },
                    });
                    console.log(`[Auto-Billing] Created invoice for ${tenantName} for cycle date ${billingDateStr} (amount: $${lease.rentAmount})`);
                }
                // Advance to the next billing cycle month
                elapsedMonths++;
                const nextDate = new Date(start);
                // Add months elapsed
                nextDate.setMonth(start.getMonth() + elapsedMonths);
                // Handle month end overflow (e.g. original day was 31st but target month only has 30 days)
                const expectedMonth = (start.getMonth() + elapsedMonths) % 12;
                if (nextDate.getMonth() !== expectedMonth) {
                    nextDate.setDate(0); // Restores to the last day of the expected month
                }
                currentBillingDate = nextDate;
            }
        }
    }
    catch (error) {
        console.error('[Auto-Billing] Error generating auto rent invoices:', error);
    }
}
async function generateAutoLateFees() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Find all rent charge invoices with an unpaid balance
        const unpaidRentInvoices = await database_1.default.invoice.findMany({
            where: {
                balance: { gt: 0 },
                lineItems: {
                    contains: 'Rent Charge',
                },
            },
        });
        for (const inv of unpaidRentInvoices) {
            if (!inv.dueDate)
                continue;
            const due = new Date(inv.dueDate);
            due.setHours(0, 0, 0, 0);
            if (isNaN(due.getTime()))
                continue;
            // Calculate difference in full calendar days
            const diffTime = today.getTime() - due.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            // If more than 10 days past due date (10-day grace period expired)
            if (diffDays > 10) {
                // Mark original invoice as Overdue if status is still 'Sent' or 'Draft'
                if (inv.status === 'Sent' || inv.status === 'Draft') {
                    await database_1.default.invoice.update({
                        where: { id: inv.id },
                        data: { status: 'Overdue' },
                    });
                }
                // Check if a Late Fee invoice has already been issued for this specific rent invoice
                const existingLateFee = await database_1.default.invoice.findFirst({
                    where: {
                        tenantId: inv.tenantId,
                        lineItems: {
                            contains: 'Late Fee Charge',
                        },
                        notes: {
                            contains: inv.dueDate,
                        },
                    },
                });
                if (!existingLateFee) {
                    const lineItems = [
                        { description: 'Late Fee Charge (Overdue Rent)', amount: 50 },
                    ];
                    const todayStr = today.toISOString().split('T')[0];
                    await database_1.default.invoice.create({
                        data: {
                            tenantId: inv.tenantId,
                            tenantName: inv.tenantName,
                            propertyId: inv.propertyId,
                            propertyName: inv.propertyName,
                            unitNumber: inv.unitNumber,
                            dueDate: todayStr,
                            amount: 50,
                            balance: 50,
                            paidAmount: 0,
                            status: 'Sent',
                            lineItems: JSON.stringify(lineItems),
                            notes: `Automated $50 late fee applied after 10-day grace period for rent due on ${inv.dueDate}`,
                            companyId: inv.companyId,
                        },
                    });
                    console.log(`[Auto-Billing] Applied $50 Late Fee for tenant ${inv.tenantName} for overdue rent due on ${inv.dueDate}`);
                }
            }
        }
    }
    catch (error) {
        console.error('[Auto-Billing] Error generating auto late fees:', error);
    }
}
