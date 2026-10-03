"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const company_controller_1 = require("../controllers/company.controller");
const router = (0, express_1.Router)();
router.get('/settings', (req, res, next) => company_controller_1.companyController.getSettings(req, res, next));
router.put('/settings', (req, res, next) => company_controller_1.companyController.updateSettings(req, res, next));
exports.default = router;
