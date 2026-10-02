import prisma from '../config/database';
import { AppError } from '../utils/appError';
import cloudinary from '../config/cloudinary';
import { getManagerCompanyId } from '../utils/companyHelper';

export class PropertyService {
  async getAllProperties(companyId?: string, user?: any) {
    let whereClause: any = companyId ? { companyId, status: { not: 'Inactive' } } : { status: { not: 'Inactive' } };

    if ((user?.roleName === 'Owner' || user?.role === 'Owner') && user?.email) {
      const owner = await prisma.owner.findFirst({
        where: { email: user.email },
      });
      if (owner) {
        whereClause.ownerId = owner.id;
      } else {
        return [];
      }
    }

    return prisma.property.findMany({
      where: whereClause,
      include: {
        owner: true,
        buildings: true,
        units: true,
      },
    });
  }

  async getPropertyById(id: string, companyId?: string) {
    const prop = await prisma.property.findFirst({
      where: companyId ? { id, companyId } : { id },
      include: {
        owner: true,
        buildings: true,
        units: true,
      },
    });
    if (!prop) throw new AppError('Property not found.', 404, 'NOT_FOUND');
    return prop;
  }

  async createProperty(data: any, file?: any) {
    const companyId = await getManagerCompanyId(undefined, data.companyId);

    if (companyId) {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (company) {
        const currentCount = await prisma.property.count({
          where: { companyId, status: { not: 'Inactive' } },
        });
        const maxLimit = company.maxProperties || 50;
        if (currentCount >= maxLimit) {
          throw new AppError(
            `Property creation limit reached! Your plan (${company.planName}) permits up to ${maxLimit} properties. Please upgrade your subscription plan.`,
            403,
            'PLAN_LIMIT_EXCEEDED'
          );
        }
      }
    }

    let ownerId = data.ownerId;
    let ownerExists = false;

    if (ownerId) {
      try {
        const owner = await prisma.owner.findFirst({
          where: companyId ? { id: ownerId, companyId } : { id: ownerId },
        });
        if (owner) {
          ownerExists = true;
        } else {
          throw new AppError('Owner not found or does not belong to your company.', 404, 'NOT_FOUND');
        }
      } catch (e) {
        if (e instanceof AppError) throw e;
        // ignore
      }
    }

    if (!ownerExists) {
      const firstOwner = await prisma.owner.findFirst({
        where: companyId ? { companyId } : {},
      });
      if (firstOwner) {
        ownerId = firstOwner.id;
      } else {
        const defaultOwner = await prisma.owner.create({
          data: {
            name: 'Default Owner',
            email: `default.owner.${Date.now()}@example.com`,
            phone: '555-0100',
            companyId,
          }
        });
        ownerId = defaultOwner.id;
      }
    }

    let typeVal = (data.type || 'Apartment').replace(/\s+/g, '');
    if (typeVal === 'Mixed-UseProperty(MUP)' || typeVal === 'MixedUse') typeVal = 'MUP';
    const validTypes = ['Apartment', 'Commercial', 'SingleFamily', 'MultiFamily', 'HOA', 'MUP'];
    if (!validTypes.includes(typeVal)) {
      typeVal = 'Apartment';
    }

    // Cloudinary upload
    let imageUrl = data.imageUrl || null;
    if (file) {
      try {
        imageUrl = await new Promise<string>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'properties' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result?.secure_url || '');
            }
          );
          uploadStream.end(file.buffer);
        });
      } catch (err) {
        console.error('Cloudinary image upload failed:', err);
      }
    }

    const createdProp = await prisma.property.create({
      data: {
        name: data.name,
        type: typeVal as any,
        status: data.status || 'Active',
        ownerId: ownerId,
        ownershipPercentage: Number(data.ownershipPercentage) || 100,
        managementCompany: data.managementCompany || 'Apex Property Management',
        address: data.address || 'Austin, TX',
        streetAddress: data.streetAddress || data.address || '100 Main St',
        city: data.city || 'Austin',
        state: data.state || 'TX',
        zip: data.zip || '78701',
        yearBuilt: Number(data.yearBuilt) || 2020,
        squareFootage: Number(data.squareFootage) || 10000,
        purchasePrice: Number(data.purchasePrice) || 1000000,
        currentValue: Number(data.currentValue) || 1200000,
        imageUrl: imageUrl,
        companyId: data.companyId,
        nycBin: data.nycBin || data.bin || null,
      },
    });

    // Auto-create default Building for hierarchy safety
    try {
      await prisma.building.create({
        data: {
          propertyId: createdProp.id,
          name: createdProp.name,
          floors: Number(data.totalFloors || data.totalBuildings || data.floors || 1),
          unitsCount: Number(data.totalUnits !== undefined && data.totalUnits !== null && Number(data.totalUnits) > 0 ? data.totalUnits : 1),
        },
      });
    } catch (bldErr) {
      console.error('Failed to auto-create building for property:', bldErr);
    }

    return createdProp;
  }

  async deleteProperty(id: string, companyId?: string) {
    if (companyId) {
      const prop = await prisma.property.findFirst({
        where: { id, companyId },
      });
      if (!prop) throw new AppError('Property not found.', 404, 'NOT_FOUND');
    }

    // Auto-delete associated buildings when property is deleted
    try {
      await prisma.building.deleteMany({
        where: { propertyId: id },
      });
    } catch (err) {
      console.error('Failed to auto-delete buildings for property:', err);
    }

    return prisma.property.update({
      where: { id },
      data: { status: 'Inactive' },
    });
  }

  async updateProperty(id: string, data: any, file?: any, companyId?: string) {
    const prop = await prisma.property.findFirst({
      where: companyId ? { id, companyId } : { id },
    });
    if (!prop) throw new AppError('Property not found.', 404, 'NOT_FOUND');

    let ownerId = data.ownerId;
    if (ownerId) {
      const owner = await prisma.owner.findFirst({
        where: companyId ? { id: ownerId, companyId } : { id: ownerId },
      });
      if (!owner) {
        throw new AppError('Owner not found or does not belong to your company.', 404, 'NOT_FOUND');
      }
    } else {
      ownerId = prop.ownerId;
    }

    let typeVal = data.type;
    if (typeVal) {
      typeVal = typeVal.replace(/\s+/g, '');
      if (typeVal === 'Mixed-UseProperty(MUP)' || typeVal === 'MixedUse') typeVal = 'MUP';
      const validTypes = ['Apartment', 'Commercial', 'SingleFamily', 'MultiFamily', 'HOA', 'MUP'];
      if (!validTypes.includes(typeVal)) {
        typeVal = prop.type;
      }
    } else {
      typeVal = prop.type;
    }

    // Cloudinary upload
    let imageUrl = data.imageUrl !== undefined ? data.imageUrl : prop.imageUrl;
    if (file) {
      try {
        imageUrl = await new Promise<string>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'properties' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result?.secure_url || '');
            }
          );
          uploadStream.end(file.buffer);
        });
      } catch (err) {
        console.error('Cloudinary image upload failed:', err);
      }
    }

    const binVal = data.nycBin !== undefined ? data.nycBin : (data.bin !== undefined ? data.bin : prop.nycBin);

    const updatedProp = await prisma.property.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : prop.name,
        type: typeVal as any,
        status: data.status !== undefined ? data.status : prop.status,
        ownerId: ownerId,
        ownershipPercentage: data.ownershipPercentage !== undefined ? Number(data.ownershipPercentage) : prop.ownershipPercentage,
        managementCompany: data.managementCompany !== undefined ? data.managementCompany : prop.managementCompany,
        address: data.address !== undefined ? data.address : prop.address,
        streetAddress: data.streetAddress !== undefined ? data.streetAddress : prop.streetAddress,
        city: data.city !== undefined ? data.city : prop.city,
        state: data.state !== undefined ? data.state : prop.state,
        zip: data.zip !== undefined ? data.zip : prop.zip,
        yearBuilt: data.yearBuilt !== undefined ? Number(data.yearBuilt) : prop.yearBuilt,
        squareFootage: data.squareFootage !== undefined ? Number(data.squareFootage) : prop.squareFootage,
        purchasePrice: data.purchasePrice !== undefined ? Number(data.purchasePrice) : prop.purchasePrice,
        currentValue: data.currentValue !== undefined ? Number(data.currentValue) : prop.currentValue,
        nycBin: binVal,
        imageUrl: imageUrl,
      },
    });

    // Auto-update associated building details (name, floors & unitsCount)
    try {
      const bldData: any = {};
      if (data.name !== undefined) bldData.name = updatedProp.name;
      if (data.totalFloors !== undefined || data.totalBuildings !== undefined || data.floors !== undefined) {
        bldData.floors = Number(data.totalFloors || data.totalBuildings || data.floors || 1);
      }
      if (data.totalUnits !== undefined && data.totalUnits !== null) {
        bldData.unitsCount = Number(data.totalUnits);
      }
      if (Object.keys(bldData).length > 0) {
        await prisma.building.updateMany({
          where: { propertyId: id },
          data: bldData,
        });
      }
    } catch (bldErr) {
      console.error('Failed to auto-update building for property:', bldErr);
    }

    return updatedProp;
  }
}

export const propertyService = new PropertyService();
