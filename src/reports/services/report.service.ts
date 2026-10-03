import { ReportRepository } from '../repositories/report.repository';
import prisma from '../../config/database';
import { AppError } from '../../utils/appError';

export class ReportService {
  private reportRepository: ReportRepository;

  constructor() {
    this.reportRepository = new ReportRepository();
  }

  // Helper: Resolve Allowed Property IDs for a User
  async resolveAllowedProperties(user: any, companyId?: string): Promise<string[]> {
    if (!user) {
      throw new AppError('Unauthorized access.', 401, 'UNAUTHORIZED');
    }

    const targetCompanyId = companyId || user.companyId;
    if (!targetCompanyId) {
      return [];
    }

    const userRole = user.roleName || user.role || (user.role && user.role.name);
    if (!userRole || userRole === 'Admin' || userRole === 'Accountant' || userRole === 'SuperAdmin' || userRole === 'Property Manager' || userRole === 'Manager' || userRole === 'Owner') {
      const properties = await prisma.property.findMany({
        where: { companyId: targetCompanyId },
        select: { id: true },
      });
      return properties.map((p) => p.id);
    }

    // For assigned users, filter by explicit user assignments
    const assignments = await prisma.userAssignment.findMany({
      where: {
        userId: user.id,
      },
      select: { propertyId: true },
    });

    const assignedIds = assignments
      .map((a) => a.propertyId)
      .filter((id): id is string => id !== null);

    return assignedIds;
  }

  // 1. Rent Roll
  async getRentRoll(user: any, query: any) {
    const companyId = user.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);
    
    if (!companyId || allowedProperties.length === 0) {
      return {
        data: [],
        summary: { totalMonthlyRent: 0, totalSecurityDeposits: 0, occupiedCount: 0, vacantCount: 0, totalUnits: 0 },
        pagination: { page: 1, limit: 50, totalRecords: 0, totalPages: 0 },
      };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;

    const result = await this.reportRepository.getRentRollData({
      companyId,
      propertyIds: allowedProperties,
      propertyId: query.propertyId,
      leaseStatus: query.status,
      search: query.search,
      page,
      limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    let leases = result.leases;
    let unitsFallback: any[] = [];
    if (leases.length === 0) {
      unitsFallback = await prisma.unit.findMany({
        where: {
          propertyId: { in: query.propertyId ? [query.propertyId] : allowedProperties },
        },
        include: { property: true, tenants: true },
      });
    }

    let data: any[] = [];
    if (leases.length > 0) {
      data = leases.map((l) => ({
        propertyName: l.property?.name || 'Property',
        unitNumber: l.unit?.unitNumber ? `Unit ${l.unit.unitNumber}` : 'Unit 101',
        tenantName: l.tenant ? `${l.tenant.firstName} ${l.tenant.lastName}` : 'Resident',
        startDate: l.startDate ? new Date(l.startDate).toISOString().split('T')[0] : 'N/A',
        endDate: l.endDate ? new Date(l.endDate).toISOString().split('T')[0] : 'N/A',
        leaseStatus: l.status || 'Active',
        monthlyRent: Number(l.rentAmount || l.unit?.rentAmount || 0),
        securityDeposit: Number(l.depositAmount || l.unit?.securityDeposit || 0),
        unitStatus: l.unit?.status || (l.status === 'Active' ? 'Occupied' : 'Vacant'),
      }));
    } else {
      data = unitsFallback.map((u) => {
        const tenantObj = u.tenants && u.tenants.length > 0 ? u.tenants[0] : null;
        return {
          propertyName: u.property?.name || 'Property',
          unitNumber: u.unitNumber ? `Unit ${u.unitNumber}` : 'Unit 101',
          tenantName: tenantObj ? `${tenantObj.firstName} ${tenantObj.lastName}` : (u.status === 'Occupied' ? 'Tenant Assigned' : 'Vacant'),
          startDate: u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : 'N/A',
          endDate: 'N/A',
          leaseStatus: u.status === 'Occupied' ? 'Active' : 'Vacant',
          monthlyRent: Number(u.rentAmount || 0),
          securityDeposit: Number(u.securityDeposit || 0),
          unitStatus: u.status || 'Vacant',
        };
      });
    }

    const totalMonthlyRent = result.summary?.totalMonthlyRent ?? data.reduce((sum, item) => sum + item.monthlyRent, 0);
    const totalSecurityDeposits = result.summary?.totalSecurityDeposits ?? data.reduce((sum, item) => sum + item.securityDeposit, 0);
    const occupiedCount = result.summary?.occupiedCount ?? data.filter((item) => item.unitStatus === 'Occupied' || item.leaseStatus === 'Active').length;
    const vacantCount = result.summary?.vacantCount ?? Math.max(0, data.length - occupiedCount);

    return {
      data,
      summary: {
        totalMonthlyRent,
        totalSecurityDeposits,
        occupiedCount,
        vacantCount,
        totalUnits: result.summary?.totalUnits || data.length,
      },
      pagination: {
        page,
        limit,
        totalRecords: result.totalRecords || data.length,
        totalPages: Math.ceil((result.totalRecords || data.length) / limit) || (data.length > 0 ? 1 : 0),
      },
    };
  }

  // 2. Occupancy Report
  async getOccupancy(user: any, query: any) {
    const companyId = user.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);

    if (!companyId || allowedProperties.length === 0) {
      return {
        data: [],
        summary: { portfolioTotalUnits: 0, portfolioOccupiedUnits: 0, portfolioVacantUnits: 0, portfolioMaintenanceUnits: 0, overallOccupancyPercentage: 0, totalProperties: 0 },
        pagination: { page: 1, limit: 50, totalRecords: 0, totalPages: 0 },
      };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;

    const result = await this.reportRepository.getOccupancyData({
      companyId,
      propertyIds: allowedProperties,
      propertyId: query.propertyId,
      page,
      limit,
    });

    const data = result.properties.map((p) => {
      const totalUnits = p.units ? p.units.length : 0;
      let occupiedUnits = 0;
      let maintenanceUnits = 0;
      let vacantUnits = 0;

      if (p.units) {
        p.units.forEach((u: any) => {
          if (u.status === 'Occupied') occupiedUnits++;
          else if (u.status === 'UnderMaintenance') maintenanceUnits++;
          else vacantUnits++;
        });
      }

      const occupancyPercentage = totalUnits > 0 ? parseFloat(((occupiedUnits / totalUnits) * 100).toFixed(1)) : 0.0;

      return {
        propertyName: p.name,
        totalUnits,
        occupiedUnits,
        vacantUnits,
        maintenanceUnits,
        occupancyPercentage,
      };
    });

    return {
      data,
      summary: result.summary || {
        portfolioTotalUnits: 0,
        portfolioOccupiedUnits: 0,
        portfolioVacantUnits: 0,
        portfolioMaintenanceUnits: 0,
        overallOccupancyPercentage: 0,
        totalProperties: result.totalRecords,
      },
      pagination: {
        page,
        limit,
        totalRecords: result.totalRecords,
        totalPages: Math.ceil(result.totalRecords / limit) || (data.length > 0 ? 1 : 0),
      },
    };
  }

  // 3. Delinquency Report
  async getDelinquency(user: any, query: any) {
    const companyId = user.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);

    if (!companyId || allowedProperties.length === 0) {
      return {
        data: [],
        summary: { totalDelinquentBalance: 0, totalOriginalAmount: 0, totalDelinquentTenants: 0, totalDelinquentInvoices: 0, averageDaysLate: 0 },
        pagination: { page: 1, limit: 50, totalRecords: 0, totalPages: 0 },
      };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;

    const result = await this.reportRepository.getDelinquencyData({
      companyId,
      propertyIds: allowedProperties,
      propertyId: query.propertyId,
      tenantId: query.tenantId,
      status: query.status,
      page,
      limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const today = new Date().getTime();

    // Filter out Paid invoices so ONLY delinquent/unpaid/overdue invoices are returned
    const delinquentInvoices = result.invoices.filter((inv) => {
      if (query.status) return true;
      const statusLower = (inv.status || '').toLowerCase();
      const isPaid = statusLower === 'paid' || statusLower === 'cleared';
      return !isPaid;
    });

    const data = delinquentInvoices.map((inv) => {
      const dueDateMs = inv.dueDate ? new Date(inv.dueDate).getTime() : today;
      const diffTime = Math.max(0, today - dueDateMs);
      const daysLate = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      const rentAmount = Number(inv.amount || 0);
      const paidAmount = Number(inv.paidAmount || 0);
      const outstandingBalance = Number(inv.balance ?? Math.max(0, rentAmount - paidAmount));

      return {
        tenantName: inv.tenant ? `${inv.tenant.firstName} ${inv.tenant.lastName}` : (inv.tenantName || 'Resident'),
        propertyName: inv.propertyName || 'Property',
        unitNumber: inv.unitNumber || 'Unit 101',
        dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : 'N/A',
        rentAmount,
        paidAmount,
        outstandingBalance,
        daysLate,
        paymentStatus: inv.status || 'Overdue',
      };
    });

    return {
      data,
      summary: result.summary || {
        totalDelinquentBalance: 0,
        totalOriginalAmount: 0,
        totalDelinquentTenants: 0,
        totalDelinquentInvoices: 0,
        averageDaysLate: 0,
      },
      pagination: {
        page,
        limit,
        totalRecords: result.totalRecords,
        totalPages: Math.ceil(result.totalRecords / limit) || (data.length > 0 ? 1 : 0),
      },
    };
  }

  // 4. Profit & Loss Report
  async getProfitLoss(user: any, query: any) {
    const companyId = user.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);

    if (!companyId || allowedProperties.length === 0) {
      return { data: { income: [], expenses: [], summary: { totalIncome: 0, totalExpenses: 0, netProfit: 0 } } };
    }

    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    const lines = await this.reportRepository.getProfitLossData({
      companyId,
      propertyIds: allowedProperties,
      propertyId: query.propertyId,
      startDate,
      endDate,
    });

    const incomeMap: Record<string, number> = {};
    const expensesMap: Record<string, number> = {};

    lines.forEach((l) => {
      const category = l.account?.accountName || 'Rental Revenue';
      const type = l.account?.type || 'Revenue';
      const amount = l.credit - l.debit;

      if (type === 'Revenue') {
        incomeMap[category] = (incomeMap[category] || 0) + amount;
      } else if (type === 'Expense') {
        const expAmount = l.debit - l.credit;
        expensesMap[category] = (expensesMap[category] || 0) + expAmount;
      }
    });

    if (Object.keys(incomeMap).length === 0 && Object.keys(expensesMap).length === 0) {
      const [payments, invoices, workOrders] = await Promise.all([
        prisma.rentPayment.findMany({ where: { companyId, propertyId: { in: allowedProperties } } }),
        prisma.invoice.findMany({ where: { companyId, propertyId: { in: allowedProperties } } }),
        prisma.workOrder.findMany({ where: { companyId, propertyId: { in: allowedProperties } } }),
      ]);

      const rentPaymentsSum = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const paidInvoicesSum = invoices
        .filter((i) => i.status === 'Paid' || i.status === 'Partially Paid')
        .reduce((sum, i) => sum + Number(i.paidAmount || i.amount || 0), 0);

      const rentalIncome = Math.max(rentPaymentsSum, paidInvoicesSum);
      if (rentalIncome > 0) {
        incomeMap['Rental Revenue'] = rentalIncome;
      }

      let lateFeeIncome = 0;
      invoices.forEach((inv) => {
        if (Array.isArray(inv.lineItems)) {
          inv.lineItems.forEach((li: any) => {
            if (li.description && li.description.toLowerCase().includes('late fee')) {
              lateFeeIncome += Number(li.amount || 0);
            }
          });
        }
      });
      if (lateFeeIncome > 0) {
        incomeMap['Late Fee Income'] = lateFeeIncome;
      }

      const maintenanceExpenses = workOrders.reduce(
        (sum, w: any) => sum + Number(w.actualCost || w.cost || w.estimatedCost || 0),
        0
      );
      if (maintenanceExpenses > 0) {
        expensesMap['Maintenance & Repairs'] = maintenanceExpenses;
      }
    }

    const income = Object.keys(incomeMap).map((k) => ({ name: k, amount: incomeMap[k] }));
    const expenses = Object.keys(expensesMap).map((k) => ({ name: k, amount: expensesMap[k] }));

    const totalIncome = income.reduce((acc, curr) => acc + curr.amount, 0);
    const totalExpenses = expenses.reduce((acc, curr) => acc + curr.amount, 0);
    const netProfit = totalIncome - totalExpenses;

    return {
      data: {
        income,
        expenses,
        summary: {
          totalIncome,
          totalExpenses,
          netProfit,
        },
      },
    };
  }

  // 5. Maintenance Report
  async getMaintenance(user: any, query: any) {
    const companyId = user.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);

    if (!companyId || allowedProperties.length === 0) {
      return {
        data: [],
        summary: { totalWorkOrders: 0, totalEstimatedCost: 0, totalActualCost: 0, completedCount: 0, inProgressCount: 0, openCount: 0, completionRate: 0 },
        pagination: { page: 1, limit: 50, totalRecords: 0, totalPages: 0 },
      };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;

    const result = await this.reportRepository.getMaintenanceData({
      companyId,
      propertyIds: allowedProperties,
      propertyId: query.propertyId,
      status: query.status,
      priority: query.priority,
      page,
      limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const data = result.workOrders.map((w: any, idx: number) => {
      const est = Number(w.estimatedCost || 0);
      const act = Number(w.actualCost || w.cost || est);
      const st = w.status || 'Open';

      return {
        ticketId: `WO-${1001 + idx}`,
        propertyName: w.property?.name || w.propertyName || 'Property',
        unitNumber: w.unitNumber || 'Unit 101',
        issue: w.title,
        priority: w.priority || 'Medium',
        status: st,
        assignedPerson: w.vendor?.contactName || w.assignedTechnician || 'Unassigned',
        vendor: w.vendor?.companyName || w.vendorName || 'Unassigned',
        estimatedCost: est,
        actualCost: act,
        createdDate: w.createdAt ? new Date(w.createdAt).toISOString().split('T')[0] : 'N/A',
        completedDate: st === 'Completed' ? (w.updatedAt ? new Date(w.updatedAt).toISOString().split('T')[0] : 'N/A') : null,
      };
    });

    return {
      data,
      summary: result.summary || {
        totalWorkOrders: result.totalRecords,
        totalEstimatedCost: 0,
        totalActualCost: 0,
        completedCount: 0,
        inProgressCount: 0,
        openCount: 0,
        completionRate: 0,
      },
      pagination: {
        page,
        limit,
        totalRecords: result.totalRecords,
        totalPages: Math.ceil(result.totalRecords / limit) || (data.length > 0 ? 1 : 0),
      },
    };
  }

  // 6. Payment History
  async getPaymentHistory(user: any, query: any) {
    const companyId = user.companyId;
    const allowedProperties = await this.resolveAllowedProperties(user, companyId);

    if (!companyId || allowedProperties.length === 0) {
      return {
        data: [],
        summary: { totalCollectedAmount: 0, totalTransactions: 0, averageTransaction: 0, topMethod: 'N/A' },
        pagination: { page: 1, limit: 50, totalRecords: 0, totalPages: 0 },
      };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;

    const result = await this.reportRepository.getPaymentHistoryData({
      companyId,
      propertyIds: allowedProperties,
      propertyId: query.propertyId,
      tenantId: query.tenantId,
      paymentMethod: query.paymentMethod,
      status: query.status,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      page,
      limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    let data = result.payments.map((p: any, idx: number) => ({
      receiptNo: `#${idx + 1}`,
      tenantName: p.tenant ? `${p.tenant.firstName} ${p.tenant.lastName}` : (p.tenantName || 'Resident'),
      propertyName: p.property?.name || p.propertyName || 'Property',
      unitNumber: p.unit?.unitNumber ? `Unit ${p.unit.unitNumber}` : (p.unitNumber || 'Unassigned'),
      paymentDate: p.paidDate ? new Date(p.paidDate).toISOString().split('T')[0] : (p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : 'N/A'),
      amount: Number(p.amount || 0),
      paymentMethod: p.paymentMethod || 'ACH',
      referenceNumber: p.referenceNumber || `#REF-${1001 + idx}`,
      paymentStatus: p.status || 'Paid',
    }));

    if (data.length === 0) {
      const paidInvoices = await prisma.invoice.findMany({
        where: {
          companyId,
          propertyId: { in: query.propertyId ? [query.propertyId] : allowedProperties },
          status: { in: ['Paid', 'Partially Paid'] },
        },
        include: { tenant: true },
      });

      data = paidInvoices.map((inv, idx) => ({
        receiptNo: `#INV-${1001 + idx}`,
        tenantName: inv.tenant ? `${inv.tenant.firstName} ${inv.tenant.lastName}` : (inv.tenantName || 'Resident'),
        propertyName: inv.propertyName || 'Property',
        unitNumber: inv.unitNumber || 'Unassigned',
        paymentDate: inv.updatedAt ? new Date(inv.updatedAt).toISOString().split('T')[0] : 'N/A',
        amount: Number(inv.paidAmount || inv.amount || 0),
        paymentMethod: 'Bank Transfer',
        referenceNumber: `#INV-REF-${inv.id.substring(0, 6)}`,
        paymentStatus: 'Paid',
      }));
    }

    let totalCollectedAmount = 0;
    const methodCounts: Record<string, number> = {};

    data.forEach((p) => {
      totalCollectedAmount += p.amount;
      const method = p.paymentMethod || 'ACH';
      methodCounts[method] = (methodCounts[method] || 0) + 1;
    });

    let topMethod = 'ACH';
    let maxCount = 0;
    Object.entries(methodCounts).forEach(([m, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topMethod = m;
      }
    });

    const averageTransaction = data.length > 0 ? Math.round(totalCollectedAmount / data.length) : 0;

    return {
      data,
      summary: {
        totalCollectedAmount: result.summary?.totalCollectedAmount || totalCollectedAmount,
        totalTransactions: result.summary?.totalTransactions || data.length,
        averageTransaction: result.summary?.averageTransaction || averageTransaction,
        topMethod,
      },
      pagination: {
        page,
        limit,
        totalRecords: result.totalRecords || data.length,
        totalPages: Math.ceil((result.totalRecords || data.length) / limit) || (data.length > 0 ? 1 : 0),
      },
    };
  }

  // Exports tracking
  async createExport(user: any, body: any) {
    const companyId = user.companyId;
    return this.reportRepository.createExport({
      companyId,
      userId: user.id,
      reportType: body.reportType,
      filters: JSON.stringify(body.filters),
      fileName: body.fileName,
      fileType: body.fileType,
      status: 'Pending',
    });
  }

  async getExports(user: any, query: any) {
    const companyId = user.companyId;
    if (!companyId) return { exports: [], totalRecords: 0 };

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    return this.reportRepository.getExports(companyId, user.id, page, limit);
  }
}
export const reportService = new ReportService();
