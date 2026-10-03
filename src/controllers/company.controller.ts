import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../utils/appError';
import { getManagerCompanyId } from '../utils/companyHelper';

export class CompanyController {
  // Get Company Settings (including Late Fee & Grace Period Settings)
  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const companyId = await getManagerCompanyId(user);

      if (!companyId) {
        // Fallback default settings if user has no assigned company
        return sendSuccess({
          res,
          data: {
            lateFeeGraceDays: 10,
            lateFeeAmount: 50,
            lateFeeType: 'FLAT',
            isLateFeeEnabled: true,
          },
        });
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        throw new AppError('Company not found.', 404, 'NOT_FOUND');
      }

      return sendSuccess({
        res,
        data: {
          id: company.id,
          name: company.name,
          email: company.email,
          phone: company.phone,
          lateFeeGraceDays: company.lateFeeGraceDays ?? 10,
          lateFeeAmount: company.lateFeeAmount ?? 50,
          lateFeeType: company.lateFeeType || 'FLAT',
          isLateFeeEnabled: company.isLateFeeEnabled ?? true,
          planName: company.planName,
          status: company.status,
        },
      });
    } catch (e) {
      next(e);
    }
  }

  // Update Company Settings (Manager sets Grace Days, Late Fee Amount, etc.)
  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const companyId = await getManagerCompanyId(user);

      if (!companyId) {
        throw new AppError('No company associated with your account.', 400, 'BAD_REQUEST');
      }

      const { lateFeeGraceDays, lateFeeAmount, lateFeeType, isLateFeeEnabled, name, phone, email } = req.body;

      const updateData: any = {};
      if (lateFeeGraceDays !== undefined) updateData.lateFeeGraceDays = parseInt(lateFeeGraceDays) || 10;
      if (lateFeeAmount !== undefined) updateData.lateFeeAmount = parseFloat(lateFeeAmount) || 0;
      if (lateFeeType !== undefined) updateData.lateFeeType = lateFeeType;
      if (isLateFeeEnabled !== undefined) updateData.isLateFeeEnabled = Boolean(isLateFeeEnabled);
      if (name) updateData.name = name;
      if (phone) updateData.phone = phone;
      if (email) updateData.email = email;

      const updated = await prisma.company.update({
        where: { id: companyId },
        data: updateData,
      });

      return sendSuccess({
        res,
        message: 'Company settings updated successfully.',
        data: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          lateFeeGraceDays: updated.lateFeeGraceDays,
          lateFeeAmount: updated.lateFeeAmount,
          lateFeeType: updated.lateFeeType,
          isLateFeeEnabled: updated.isLateFeeEnabled,
        },
      });
    } catch (e) {
      next(e);
    }
  }
}

export const companyController = new CompanyController();
