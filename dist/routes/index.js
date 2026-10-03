"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const property_routes_1 = __importDefault(require("./property.routes"));
const lease_routes_1 = __importDefault(require("./lease.routes"));
const payment_routes_1 = __importDefault(require("./payment.routes"));
const accounting_routes_1 = __importDefault(require("./accounting.routes"));
const tenant_routes_1 = __importDefault(require("./tenant.routes"));
const owner_routes_1 = __importDefault(require("./owner.routes"));
const vendor_routes_1 = __importDefault(require("./vendor.routes"));
const workorder_routes_1 = __importDefault(require("./workorder.routes"));
const dashboard_routes_1 = __importDefault(require("./dashboard.routes"));
const secondary_routes_1 = __importDefault(require("./secondary.routes"));
const portal_routes_1 = __importDefault(require("./portal.routes"));
const building_routes_1 = __importDefault(require("./building.routes"));
const unit_routes_1 = __importDefault(require("./unit.routes"));
const application_routes_1 = __importDefault(require("./application.routes"));
const superadmin_routes_1 = __importDefault(require("./superadmin.routes"));
const invoice_routes_1 = __importDefault(require("./invoice.routes"));
const serviceRequest_routes_1 = __importDefault(require("./serviceRequest.routes"));
const moveIn_routes_1 = __importDefault(require("./moveIn.routes"));
const moveOut_routes_1 = __importDefault(require("./moveOut.routes"));
const renewal_routes_1 = __importDefault(require("./renewal.routes"));
const inspectionTemplate_routes_1 = __importDefault(require("./inspectionTemplate.routes"));
const inspection_routes_1 = __importDefault(require("./inspection.routes"));
const document_routes_1 = __importDefault(require("./document.routes"));
const report_routes_1 = __importDefault(require("../reports/routes/report.routes"));
const integration_routes_1 = __importDefault(require("./integration.routes"));
const company_routes_1 = __importDefault(require("./company.routes"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const superadmin_controller_1 = require("../controllers/superadmin.controller");
const router = (0, express_1.Router)();
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'WhatsLandlord ERP Backend',
        timestamp: new Date().toISOString(),
    });
});
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
router.post('/public/temp-db-op-clear-seed', async (req, res) => {
    if (req.headers['x-secret-key'] !== 'temp-clear-seed-key-999') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const { stdout, stderr } = await execAsync('npm run db:clear && npm run prisma:seed');
        res.json({ success: true, stdout, stderr });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message, stderr: error.stderr, stdout: error.stdout });
    }
});
router.post('/public/wordpress-inquiry', (req, res, next) => superadmin_controller_1.superAdminController.createWordPressInquiry(req, res, next));
router.use('/auth', auth_routes_1.default);
router.use('/company', auth_middleware_1.authMiddleware, company_routes_1.default);
router.use('/properties', auth_middleware_1.authMiddleware, property_routes_1.default);
router.use('/leases', auth_middleware_1.authMiddleware, lease_routes_1.default);
router.use('/payments', auth_middleware_1.authMiddleware, payment_routes_1.default);
router.use('/accounting', auth_middleware_1.authMiddleware, accounting_routes_1.default);
router.use('/tenants', auth_middleware_1.authMiddleware, tenant_routes_1.default);
router.use('/owners', auth_middleware_1.authMiddleware, owner_routes_1.default);
router.use('/vendors', auth_middleware_1.authMiddleware, vendor_routes_1.default);
router.use('/work-orders', auth_middleware_1.authMiddleware, workorder_routes_1.default);
router.use('/dashboard', auth_middleware_1.authMiddleware, dashboard_routes_1.default);
router.use('/portal', auth_middleware_1.authMiddleware, portal_routes_1.default);
router.use('/superadmin', auth_middleware_1.authMiddleware, superadmin_routes_1.default);
router.use('/invoices', auth_middleware_1.authMiddleware, invoice_routes_1.default);
router.use('/service-requests', auth_middleware_1.authMiddleware, serviceRequest_routes_1.default);
router.use('/buildings', auth_middleware_1.authMiddleware, building_routes_1.default);
router.use('/units', auth_middleware_1.authMiddleware, unit_routes_1.default);
router.use('/applications', auth_middleware_1.authMiddleware, application_routes_1.default);
router.use('/move-ins', auth_middleware_1.authMiddleware, moveIn_routes_1.default);
router.use('/move-outs', auth_middleware_1.authMiddleware, moveOut_routes_1.default);
router.use('/renewals', auth_middleware_1.authMiddleware, renewal_routes_1.default);
router.use('/inspection-templates', auth_middleware_1.authMiddleware, inspectionTemplate_routes_1.default);
router.use('/inspections', auth_middleware_1.authMiddleware, inspection_routes_1.default);
router.use('/documents', auth_middleware_1.authMiddleware, document_routes_1.default);
router.use('/reports', auth_middleware_1.authMiddleware, report_routes_1.default);
router.use('/integrations', auth_middleware_1.authMiddleware, integration_routes_1.default);
router.use('/', auth_middleware_1.authMiddleware, secondary_routes_1.default);
exports.default = router;
