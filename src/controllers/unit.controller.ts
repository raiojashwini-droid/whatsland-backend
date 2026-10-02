import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { AppError } from '../utils/appError';

export class UnitController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const companyId = req.user?.companyId;
      const units = await prisma.unit.findMany({
        where: companyId ? {
          property: {
            companyId: companyId
          }
        } : {},
        include: {
          property: true,
          building: true,
          tenants: true,
        },
      });
      return sendSuccess({ res, data: units });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const companyId = req.user?.companyId;
      const unit = await prisma.unit.findFirst({
        where: companyId ? {
          id,
          property: { companyId },
        } : { id },
        include: {
          property: true,
          building: true,
          tenants: true,
        },
      });
      return sendSuccess({ res, data: unit });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        propertyId,
        buildingId,
        unitNumber,
        floor,
        bedrooms,
        bathrooms,
        squareFootage,
        rentAmount,
        securityDeposit,
        availabilityDate,
        status,
      } = req.body;
      const companyId = req.user?.companyId;

      if (companyId) {
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        if (company) {
          const totalUnitsCount = await prisma.unit.count({
            where: { property: { companyId } },
          });
          const maxUnitsLimit = company.maxUnits || 500;
          if (totalUnitsCount >= maxUnitsLimit) {
            throw new AppError(
              `Unit creation limit reached! Your plan (${company.planName}) permits up to ${maxUnitsLimit} units. Please upgrade your subscription plan.`,
              403,
              'PLAN_LIMIT_EXCEEDED'
            );
          }
        }
      }

      let targetPropertyId = propertyId;
      let property = null;
      if (targetPropertyId) {
        property = await prisma.property.findFirst({
          where: companyId ? { id: targetPropertyId, companyId } : { id: targetPropertyId }
        });
        if (!property) {
          throw new AppError('Property not found.', 404, 'NOT_FOUND');
        }
      } else {
        property = await prisma.property.findFirst({
          where: companyId ? { companyId } : {},
        });
        if (!property) {
          throw new AppError('Please create a property before adding units.', 404, 'NOT_FOUND');
        }
      }
      targetPropertyId = property.id;

      let finalBuildingId = buildingId;
      if (finalBuildingId) {
        const existingBuilding = await prisma.building.findFirst({
          where: companyId ? {
            id: finalBuildingId,
            property: { companyId }
          } : { id: finalBuildingId },
          include: { property: true },
        });
        if (!existingBuilding) {
          finalBuildingId = undefined;
        } else if (existingBuilding.unitsCount > 0) {
          const currentUnitsCount = await prisma.unit.count({
            where: { buildingId: finalBuildingId },
          });
          if (currentUnitsCount >= existingBuilding.unitsCount) {
            const propName = property?.name || existingBuilding.property?.name || 'Property';
            throw new AppError(`Cannot add unit. Property '${propName}' is restricted to a maximum of ${existingBuilding.unitsCount} units.`, 400, 'PROPERTY_CAPACITY_REACHED');
          }
        }
      }

      if (!finalBuildingId) {
        let building = await prisma.building.findFirst({
          where: { propertyId: targetPropertyId },
        });
        if (!building) {
          building = await prisma.building.create({
            data: {
              propertyId: targetPropertyId,
              name: 'Main Building',
              floors: 1,
              unitsCount: 1,
            },
          });
        }
        finalBuildingId = building.id;

        if (building.unitsCount > 0) {
          const currentUnitsCount = await prisma.unit.count({
            where: { buildingId: finalBuildingId },
          });
          if (currentUnitsCount >= building.unitsCount) {
            throw new AppError(`Cannot add unit. Property '${property.name}' is restricted to a maximum of ${building.unitsCount} units.`, 400, 'PROPERTY_CAPACITY_REACHED');
          }
        }
      }

      // Check if unit number already exists in this property
      const existingUnit = await prisma.unit.findFirst({
        where: {
          propertyId: targetPropertyId,
          unitNumber,
        },
      });
      if (existingUnit) {
        throw new AppError(`Unit "${unitNumber}" already exists in this property.`, 400, 'DUPLICATE_UNIT');
      }

      const unit = await prisma.unit.create({
        data: {
          propertyId: targetPropertyId,
          buildingId: finalBuildingId,
          unitNumber,
          floor: parseInt(floor || '1'),
          bedrooms: parseInt(bedrooms || '1'),
          bathrooms: parseFloat(bathrooms || '1.0'),
          squareFootage: parseFloat(squareFootage || '0'),
          rentAmount: parseFloat(rentAmount || '0'),
          securityDeposit: parseFloat(securityDeposit || '0'),
          availabilityDate: new Date(availabilityDate || Date.now()),
          status: status || 'Vacant',
        },
      });
      return sendSuccess({ res, statusCode: 201, data: unit });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const companyId = req.user?.companyId;
      const {
        propertyId,
        buildingId,
        unitNumber,
        floor,
        bedrooms,
        bathrooms,
        squareFootage,
        rentAmount,
        securityDeposit,
        availabilityDate,
        status,
      } = req.body;

      if (companyId) {
        const check = await prisma.unit.findFirst({
          where: {
            id,
            property: { companyId },
          },
        });
        if (!check) throw new AppError('Unit not found.', 404, 'NOT_FOUND');
      }

      if (propertyId) {
        const prop = await prisma.property.findFirst({
          where: companyId ? { id: propertyId, companyId } : { id: propertyId }
        });
        if (!prop) throw new AppError('Property not found.', 404, 'NOT_FOUND');
      }

      if (buildingId) {
        const build = await prisma.building.findFirst({
          where: companyId ? {
            id: buildingId,
            property: { companyId }
          } : { id: buildingId }
        });
        if (!build) throw new AppError('Building not found.', 404, 'NOT_FOUND');
      }

      const unit = await prisma.unit.update({
        where: { id },
        data: {
          propertyId,
          buildingId,
          unitNumber,
          floor: floor !== undefined ? parseInt(floor) : undefined,
          bedrooms: bedrooms !== undefined ? parseInt(bedrooms) : undefined,
          bathrooms: bathrooms !== undefined ? parseFloat(bathrooms) : undefined,
          squareFootage: squareFootage !== undefined ? parseFloat(squareFootage) : undefined,
          rentAmount: rentAmount !== undefined ? parseFloat(rentAmount) : undefined,
          securityDeposit: securityDeposit !== undefined ? parseFloat(securityDeposit) : undefined,
          availabilityDate: availabilityDate ? new Date(availabilityDate) : undefined,
          status,
        },
      });
      return sendSuccess({ res, data: unit });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const companyId = req.user?.companyId;

      if (companyId) {
        const check = await prisma.unit.findFirst({
          where: {
            id,
            property: { companyId },
          },
        });
        if (!check) throw new AppError('Unit not found.', 404, 'NOT_FOUND');
      }

      await prisma.unit.delete({
        where: { id },
      });
      return sendSuccess({ res, data: { success: true } });
    } catch (error) {
      next(error);
    }
  }

  async assignTenant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const companyId = req.user?.companyId;
      const { tenantId } = req.body;

      if (companyId) {
        const check = await prisma.unit.findFirst({
          where: {
            id,
            property: { companyId },
          },
        });
        if (!check) throw new AppError('Unit not found.', 404, 'NOT_FOUND');

        if (tenantId) {
          const tenantCheck = await prisma.tenant.findFirst({
            where: { id: tenantId, companyId },
          });
          if (!tenantCheck) throw new AppError('Tenant not found.', 404, 'NOT_FOUND');
        }
      }

      const unit = await prisma.unit.update({
        where: { id },
        data: {
          status: 'Occupied',
          tenants: {
            connect: { id: tenantId },
          },
        },
      });
      return sendSuccess({ res, data: unit });
    } catch (error) {
      next(error);
    }
  }
}

export const unitController = new UnitController();
