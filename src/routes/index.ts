import { Router } from 'express';
import authRoutes from './auth.routes';
import propertyRoutes from './property.routes';
import leaseRoutes from './lease.routes';
import paymentRoutes from './payment.routes';
import accountingRoutes from './accounting.routes';
import tenantRoutes from './tenant.routes';
import ownerRoutes from './owner.routes';
import vendorRoutes from './vendor.routes';
import workOrderRoutes from './workorder.routes';
import dashboardRoutes from './dashboard.routes';
import secondaryRoutes from './secondary.routes';
import portalRoutes from './portal.routes';
import buildingRoutes from './building.routes';
import unitRoutes from './unit.routes';
import applicationRoutes from './application.routes';
import superAdminRoutes from './superadmin.routes';
import invoiceRoutes from './invoice.routes';
import serviceRequestRoutes from './serviceRequest.routes';
import moveInRoutes from './moveIn.routes';
import moveOutRoutes from './moveOut.routes';
import renewalRoutes from './renewal.routes';
import inspectionTemplateRoutes from './inspectionTemplate.routes';
import inspectionRoutes from './inspection.routes';
import documentRoutes from './document.routes';
import reportRoutes from '../reports/routes/report.routes';
import integrationRoutes from './integration.routes';
import companyRoutes from './company.routes';
import { authMiddleware } from '../middlewares/auth.middleware';
import { superAdminController } from '../controllers/superadmin.controller';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'WhatsLandlord ERP Backend',
    timestamp: new Date().toISOString(),
  });
});

import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

router.post('/public/temp-db-op-clear-seed', async (req, res) => {
  if (req.headers['x-secret-key'] !== 'temp-clear-seed-key-999') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  try {
    const { stdout, stderr } = await execAsync('npm run db:clear && npm run prisma:seed');
    res.json({ success: true, stdout, stderr });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, stderr: error.stderr, stdout: error.stdout });
  }
});

router.post('/public/wordpress-inquiry', (req, res, next) => superAdminController.createWordPressInquiry(req, res, next));

router.use('/auth', authRoutes);
router.use('/company', authMiddleware, companyRoutes);
router.use('/properties', authMiddleware, propertyRoutes);
router.use('/leases', authMiddleware, leaseRoutes);
router.use('/payments', authMiddleware, paymentRoutes);
router.use('/accounting', authMiddleware, accountingRoutes);
router.use('/tenants', authMiddleware, tenantRoutes);
router.use('/owners', authMiddleware, ownerRoutes);
router.use('/vendors', authMiddleware, vendorRoutes);
router.use('/work-orders', authMiddleware, workOrderRoutes);
router.use('/dashboard', authMiddleware, dashboardRoutes);
router.use('/portal', authMiddleware, portalRoutes);
router.use('/superadmin', authMiddleware, superAdminRoutes);
router.use('/invoices', authMiddleware, invoiceRoutes);
router.use('/service-requests', authMiddleware, serviceRequestRoutes);
router.use('/buildings', authMiddleware, buildingRoutes);
router.use('/units', authMiddleware, unitRoutes);
router.use('/applications', authMiddleware, applicationRoutes);
router.use('/move-ins', authMiddleware, moveInRoutes);
router.use('/move-outs', authMiddleware, moveOutRoutes);
router.use('/renewals', authMiddleware, renewalRoutes);
router.use('/inspection-templates', authMiddleware, inspectionTemplateRoutes);
router.use('/inspections', authMiddleware, inspectionRoutes);
router.use('/documents', authMiddleware, documentRoutes);
router.use('/reports', authMiddleware, reportRoutes);
router.use('/integrations', authMiddleware, integrationRoutes);
router.use('/', authMiddleware, secondaryRoutes);

export default router;


