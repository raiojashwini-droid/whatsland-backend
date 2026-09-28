import prisma from '../config/database';

// Helper function to get current Date at midnight (00:00:00 UTC) matching America/New_York timezone date
export function getNewYorkDate(): Date {
  const nyDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [year, month, day] = nyDateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// Helper function to parse YYYY-MM-DD string into midnight UTC Date
export function parseDateUTC(dateStr: string): Date | null {
  if (!dateStr) return null;
  const cleanStr = dateStr.split('T')[0];
  const parts = cleanStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

export async function generateAutoInvoices() {
  try {
    const today = getNewYorkDate();

    // Fetch active leases that have already started
    const activeLeases = await prisma.lease.findMany({
      where: {
        status: 'Active',
      },
      include: {
        tenant: true,
        property: true,
        unit: true,
      },
    });

    for (const lease of activeLeases) {
      if (!lease.tenantId || !lease.startDate) continue;

      const start = parseDateUTC(lease.startDate.toISOString());
      if (!start || start > today) continue;

      const end = lease.endDate ? parseDateUTC(lease.endDate.toISOString()) : new Date(Date.UTC(2099, 11, 31));
      if (!end) continue;

      // Verify today is not past lease end date
      const limitDate = today < end ? today : end;

      // Batch fetch existing rent invoices for this tenant to avoid connection pool exhaustion
      const existingInvoices = await prisma.invoice.findMany({
        where: {
          tenantId: lease.tenantId,
          lineItems: {
            contains: 'Rent',
          },
        },
        select: {
          dueDate: true,
        },
      });
      const existingDueDates = new Set(existingInvoices.map((i: any) => i.dueDate));

      let elapsedMonths = 0;
      let currentBillingDate = new Date(start.getTime());

      while (currentBillingDate <= limitDate) {
        const billingDateStr = currentBillingDate.toISOString().split('T')[0];

        if (!existingDueDates.has(billingDateStr)) {
          const tenantName = lease.tenant ? `${lease.tenant.firstName || ''} ${lease.tenant.lastName || ''}`.trim() : 'Tenant';
          const lineItems = [
            { description: 'Rent Charge', amount: lease.rentAmount },
          ];

          await prisma.invoice.create({
            data: {
              tenantId: lease.tenantId,
              tenantName,
              propertyId: lease.propertyId,
              propertyName: lease.property?.name || 'Property',
              unitNumber: lease.unit?.unitNumber || 'Unit',
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
          existingDueDates.add(billingDateStr);
          console.log(`[Auto-Billing (NY)] Created invoice for ${tenantName} for cycle date ${billingDateStr} (amount: $${lease.rentAmount})`);
        }

        // Advance to the next billing cycle month
        elapsedMonths++;
        const nextDate = new Date(start.getTime());
        nextDate.setUTCMonth(start.getUTCMonth() + elapsedMonths);

        const expectedMonth = (start.getUTCMonth() + elapsedMonths) % 12;
        if (nextDate.getUTCMonth() !== expectedMonth) {
          nextDate.setUTCDate(0);
        }

        currentBillingDate = nextDate;
      }
    }
  } catch (error) {
    console.error('[Auto-Billing (NY)] Error generating auto rent invoices:', error);
  }
}

export async function generateAutoLateFees() {
  try {
    const today = getNewYorkDate();
    const todayStr = today.toISOString().split('T')[0];

    // Find all invoices with an unpaid balance
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        balance: { gt: 0 },
        status: { notIn: ['Paid', 'Cancelled'] },
      },
    });

    for (const inv of unpaidInvoices) {
      if (!inv.dueDate) continue;

      // Ensure it is a rent-related invoice
      const lineItemsStr = String(inv.lineItems || '').toLowerCase();
      if (!lineItemsStr.includes('rent')) continue;

      const due = parseDateUTC(inv.dueDate);
      if (!due) continue;

      // Calculate difference in full calendar days (New York Time)
      const diffTime = today.getTime() - due.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      // 10-day grace period in America/New_York timezone
      if (diffDays >= 10) {
        // Mark original invoice as Overdue if status is 'Sent', 'Draft', or 'Pending'
        if (inv.status === 'Sent' || inv.status === 'Draft' || inv.status === 'Pending') {
          await prisma.invoice.update({
            where: { id: inv.id },
            data: { status: 'Overdue' },
          });
        }

        // Check if a Late Fee invoice has already been issued for this specific rent invoice
        const existingLateFee = await prisma.invoice.findFirst({
          where: {
            tenantId: inv.tenantId,
            lineItems: {
              contains: 'Late Fee Charge',
            },
            OR: [
              { notes: { contains: inv.id } },
              { notes: { contains: inv.dueDate } },
            ],
          },
        });

        if (!existingLateFee) {
          const lineItems = [
            { description: 'Late Fee Charge (Overdue Rent)', amount: 50 },
          ];

          await prisma.invoice.create({
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
              notes: `Automated $50 late fee applied after 10-day grace period for rent due on ${inv.dueDate} [Ref: ${inv.id}]`,
              companyId: inv.companyId,
            },
          });

          console.log(`[Auto-Billing (NY)] Applied $50 Late Fee for tenant ${inv.tenantName} for overdue rent invoice ${inv.id} due on ${inv.dueDate}`);
        }
      }
    }
  } catch (error) {
    console.error('[Auto-Billing (NY)] Error generating auto late fees:', error);
  }
}
