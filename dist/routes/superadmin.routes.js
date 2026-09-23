"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const superadmin_controller_1 = require("../controllers/superadmin.controller");
const router = (0, express_1.Router)();
// Companies
router.get('/companies', (req, res, next) => superadmin_controller_1.superAdminController.getCompanies(req, res, next));
router.post('/companies', (req, res, next) => superadmin_controller_1.superAdminController.createCompany(req, res, next));
router.get('/companies/:id', (req, res, next) => superadmin_controller_1.superAdminController.getCompanyById(req, res, next));
router.put('/companies/:id', (req, res, next) => superadmin_controller_1.superAdminController.updateCompany(req, res, next));
router.delete('/companies/:id', (req, res, next) => superadmin_controller_1.superAdminController.deleteCompany(req, res, next));
// Company Users
router.get('/company-users', (req, res, next) => superadmin_controller_1.superAdminController.getCompanyUsers(req, res, next));
router.post('/company-users', (req, res, next) => superadmin_controller_1.superAdminController.createCompanyUser(req, res, next));
router.put('/company-users/:id/status', (req, res, next) => superadmin_controller_1.superAdminController.updateCompanyUserStatus(req, res, next));
router.delete('/company-users/:id', (req, res, next) => superadmin_controller_1.superAdminController.deleteCompanyUser(req, res, next));
// SaaS Subscription Plans
router.get('/plans', (req, res, next) => superadmin_controller_1.superAdminController.getPlans(req, res, next));
router.post('/plans', (req, res, next) => superadmin_controller_1.superAdminController.createPlan(req, res, next));
router.put('/plans/:id', (req, res, next) => superadmin_controller_1.superAdminController.updatePlan(req, res, next));
router.delete('/plans/:id', (req, res, next) => superadmin_controller_1.superAdminController.deletePlan(req, res, next));
// SaaS Invoices
router.get('/invoices', (req, res, next) => superadmin_controller_1.superAdminController.getInvoices(req, res, next));
router.post('/invoices', (req, res, next) => superadmin_controller_1.superAdminController.createInvoice(req, res, next));
router.post('/process-payment', (req, res, next) => superadmin_controller_1.superAdminController.processSubscriptionPayment(req, res, next));
router.put('/invoices/:id/status', (req, res, next) => superadmin_controller_1.superAdminController.updateInvoiceStatus(req, res, next));
// Stats
router.get('/stats', (req, res, next) => superadmin_controller_1.superAdminController.getStats(req, res, next));
// Platform Settings
router.get('/settings', (req, res, next) => superadmin_controller_1.superAdminController.getSettings(req, res, next));
router.post('/settings', (req, res, next) => superadmin_controller_1.superAdminController.updateSettings(req, res, next));
// Audit Logs
router.get('/audit-logs', (req, res, next) => superadmin_controller_1.superAdminController.getAuditLogs(req, res, next));
router.post('/audit-logs', (req, res, next) => superadmin_controller_1.superAdminController.createAuditLog(req, res, next));
// WordPress Inquiries
router.get('/wordpress-inquiries', (req, res, next) => superadmin_controller_1.superAdminController.getWordPressInquiries(req, res, next));
exports.default = router;
