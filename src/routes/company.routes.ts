import { Router } from 'express';
import { companyController } from '../controllers/company.controller';

const router = Router();

router.get('/settings', (req, res, next) => companyController.getSettings(req, res, next));
router.put('/settings', (req, res, next) => companyController.updateSettings(req, res, next));

export default router;
