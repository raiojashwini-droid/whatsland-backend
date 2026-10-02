import { Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { AppError } from '../utils/appError.js';
import bcrypt from 'bcrypt';
import cloudinary from '../config/cloudinary.js';
import { getManagerCompanyId } from '../utils/companyHelper.js';
import { ensureRole } from '../utils/roleHelper.js';

export class TenantController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const tenants = await prisma.tenant.findMany({
        where: companyId ? { companyId } : {},
        include: {
          unit: {
            include: {
              property: true,
            },
          },
          screeningReports: true,
          invoices: true,
        },
      });
      return sendSuccess({ res, data: tenants });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        unitId,
        status,
        password,
        dob,
        nationality,
        idType,
        idNumber,
        emergencyName,
        emergencyRelationship,
        emergencyPhone,
        employer,
        position,
        monthlyIncome,
        employmentStatus,
        currentAddress,
      } = req.body;
      const companyId = await getManagerCompanyId(req, req.body.companyId || req.user?.companyId);
      const file = req.file;

      let imageUrl = null;
      if (file) {
        try {
          imageUrl = await new Promise<string>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: 'talent' },
              (error, result) => {
                if (error) return reject(error);
                resolve(result?.secure_url || '');
              }
            );
            uploadStream.end(file.buffer);
          });
        } catch (err) {
          console.error('Cloudinary tenant photo upload failed:', err);
        }
      }

      if (email) {
        const normEmail = email.trim().toLowerCase();
        const existingTenant = await prisma.tenant.findFirst({ where: { email: normEmail } });
        if (existingTenant) {
          const updatedTenant = await prisma.tenant.update({
            where: { id: existingTenant.id },
            data: {
              unitId: unitId || existingTenant.unitId,
              firstName: firstName || existingTenant.firstName,
              lastName: lastName || existingTenant.lastName,
              phone: phone || existingTenant.phone,
              status: 'Active',
              dob: dob || existingTenant.dob,
              nationality: nationality || existingTenant.nationality,
              idType: idType || existingTenant.idType,
              idNumber: idNumber || existingTenant.idNumber,
              emergencyName: emergencyName || existingTenant.emergencyName,
              emergencyRelationship: emergencyRelationship || existingTenant.emergencyRelationship,
              emergencyPhone: emergencyPhone || existingTenant.emergencyPhone,
              employer: employer || existingTenant.employer,
              position: position || existingTenant.position,
              monthlyIncome: monthlyIncome ? Number(monthlyIncome) : existingTenant.monthlyIncome,
              employmentStatus: employmentStatus || existingTenant.employmentStatus,
              currentAddress: currentAddress || existingTenant.currentAddress,
            },
          });
          return sendSuccess({ res, statusCode: 200, data: updatedTenant });
        }

        const existingUser = await prisma.user.findFirst({ where: { email: normEmail } });
        if (existingUser) {
          const activeCompany = await prisma.company.findFirst({ where: { email: normEmail } });
          const activeOwner = await prisma.owner.findFirst({ where: { email: normEmail } });
          if (activeCompany || activeOwner) {
            throw new AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL');
          } else {
            // Remove orphaned user record to allow fresh tenant creation
            await prisma.user.deleteMany({ where: { email: normEmail } });
          }
        }
      }

      if (unitId && companyId) {
        const unit = await prisma.unit.findFirst({
          where: { id: unitId, property: { companyId } },
        });
        if (!unit) {
          throw new AppError('Unit not found.', 404, 'NOT_FOUND');
        }
      }

      const tenant = await prisma.tenant.create({
        data: {
          firstName,
          lastName,
          email,
          phone,
          unitId,
          status: status || 'Pending',
          imageUrl,
          companyId,
          dob: dob || null,
          nationality: nationality || null,
          idType: idType || null,
          idNumber: idNumber || null,
          emergencyName: emergencyName || null,
          emergencyRelationship: emergencyRelationship || null,
          emergencyPhone: emergencyPhone || null,
          employer: employer || null,
          position: position || null,
          monthlyIncome: monthlyIncome ? Number(monthlyIncome) : null,
          employmentStatus: employmentStatus || null,
          currentAddress: currentAddress || null,
        },
      });

      if (password) {
        const role = await ensureRole('Tenant');
        const passwordHash = await bcrypt.hash(password, 12);
        await prisma.user.create({
          data: {
            email,
            passwordHash,
            firstName: firstName || 'Tenant',
            lastName: lastName || 'User',
            phone: phone || null,
            roleId: role.id,
            companyId,
          },
        });
      }

      return sendSuccess({ res, statusCode: 201, data: tenant });
    } catch (error: any) {
      if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
        return next(new AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL'));
      }
      next(error);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const tenant = await prisma.tenant.findFirst({
        where: companyId ? { id: req.params.id as string, companyId } : { id: req.params.id as string },
        include: {
          unit: {
            include: {
              property: true,
            },
          },
          leases: true,
          invoices: true,
        },
      });
      if (!tenant) throw new AppError('Tenant not found.', 404, 'NOT_FOUND');
      return sendSuccess({ res, data: tenant });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        unitId,
        status,
        password,
        dob,
        nationality,
        idType,
        idNumber,
        emergencyName,
        emergencyRelationship,
        emergencyPhone,
        employer,
        position,
        monthlyIncome,
        employmentStatus,
        currentAddress,
      } = req.body;
      const companyId = req.user?.companyId;
      const id = req.params.id as string;
      const file = req.file;

      const oldTenant = await prisma.tenant.findFirst({
        where: companyId ? { id, companyId } : { id },
      });
      if (!oldTenant) throw new AppError('Tenant not found.', 404, 'NOT_FOUND');

      if (unitId && companyId) {
        const unit = await prisma.unit.findFirst({
          where: { id: unitId, property: { companyId } },
        });
        if (!unit) {
          throw new AppError('Unit not found.', 404, 'NOT_FOUND');
        }
      }

      let imageUrl = oldTenant.imageUrl;
      if (file) {
        try {
          imageUrl = await new Promise<string>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: 'talent' },
              (error, result) => {
                if (error) return reject(error);
                resolve(result?.secure_url || '');
              }
            );
            uploadStream.end(file.buffer);
          });
        } catch (err) {
          console.error('Cloudinary tenant photo upload failed:', err);
        }
      }

      const tenant = await prisma.tenant.update({
        where: { id },
        data: {
          firstName,
          lastName,
          email,
          phone,
          unitId,
          status,
          imageUrl,
          dob: dob !== undefined ? dob : undefined,
          nationality: nationality !== undefined ? nationality : undefined,
          idType: idType !== undefined ? idType : undefined,
          idNumber: idNumber !== undefined ? idNumber : undefined,
          emergencyName: emergencyName !== undefined ? emergencyName : undefined,
          emergencyRelationship: emergencyRelationship !== undefined ? emergencyRelationship : undefined,
          emergencyPhone: emergencyPhone !== undefined ? emergencyPhone : undefined,
          employer: employer !== undefined ? employer : undefined,
          position: position !== undefined ? position : undefined,
          monthlyIncome: monthlyIncome !== undefined ? (monthlyIncome ? Number(monthlyIncome) : null) : undefined,
          employmentStatus: employmentStatus !== undefined ? employmentStatus : undefined,
          currentAddress: currentAddress !== undefined ? currentAddress : undefined,
        },
      });

      if (password) {
        const passwordHash = await bcrypt.hash(password, 12);
        const existingUser = await prisma.user.findFirst({
          where: { email: oldTenant.email },
        });

        if (existingUser) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              email,
              passwordHash,
              firstName: firstName || undefined,
              lastName: lastName || undefined,
              phone,
            },
          });
        } else {
          const role = await ensureRole('Tenant');
          await prisma.user.create({
            data: {
              email,
              passwordHash,
              firstName: firstName || 'Tenant',
              lastName: lastName || 'User',
              phone: phone || null,
              roleId: role.id,
              companyId,
            },
          });
        }
      }

      return sendSuccess({ res, data: tenant });
    } catch (error: any) {
      if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
        return next(new AppError('Email address is already registered.', 400, 'DUPLICATE_EMAIL'));
      }
      next(error);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const id = req.params.id as string;

      const tenant = await prisma.tenant.findUnique({
        where: { id },
      });
      if (!tenant) throw new AppError('Tenant not found.', 404, 'NOT_FOUND');

      if (companyId && tenant.companyId !== companyId) {
        throw new AppError('Tenant not found.', 404, 'NOT_FOUND');
      }

      await prisma.$transaction(async (tx) => {
        // 1. Delete rent payments linked to tenant
        await tx.rentPayment.deleteMany({
          where: { tenantId: id },
        });

        // 2. Delete invoices linked to tenant
        await tx.invoice.deleteMany({
          where: { tenantId: id },
        });

        // 3. Delete leases linked to tenant (MoveIn, MoveOut, and LeaseRenewal have onDelete: Cascade with Lease)
        await tx.lease.deleteMany({
          where: { tenantId: id },
        });

        // 4. Delete charges & deposits linked to tenant
        await tx.charge.deleteMany({
          where: { tenantId: id },
        });
        await tx.deposit.deleteMany({
          where: { tenantId: id },
        });

        // 5. Delete payment plans, screening reports, insurance policies
        await tx.paymentPlan.deleteMany({
          where: { tenantId: id },
        });
        await tx.screeningReport.deleteMany({
          where: { tenantId: id },
        });
        await tx.insurancePolicy.deleteMany({
          where: { tenantId: id },
        });

        // 6. Delete login user safely
        if (tenant.email) {
          const normEmail = tenant.email.trim().toLowerCase();
          const users = await tx.user.findMany({ where: { email: normEmail }, select: { id: true } });
          const userIds = users.map(u => u.id);
          if (userIds.length > 0) {
            await tx.auditLog.updateMany({
              where: { userId: { in: userIds } },
              data: { userId: null }
            });
            await tx.user.deleteMany({
              where: { email: normEmail },
            });
          }
        }

        // 7. Finally, delete the Tenant itself
        await tx.tenant.delete({
          where: { id },
        });
      });

      return sendSuccess({ res, data: { success: true } });
    } catch (error) {
      next(error);
    }
  }
}

export const tenantController = new TenantController();
