import { z } from 'zod';
import { safeNumberSchema } from './validationHelpers';

const propertyTypeEnum = z.enum([
  'Apartment',
  'Commercial',
  'SingleFamily',
  'MultiFamily',
  'HOA',
  'Single Family',
  'Multi Family',
  'MUP',
  'Mixed-Use Property (MUP)',
]);

const propertyStatusEnum = z.enum([
  'Active',
  'Inactive',
  'Under Review',
  'Archived',
  'Draft',
]);

export const createPropertySchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Property Name is required' }).min(1, 'Property Name is required').max(255),
    type: propertyTypeEnum.default('Apartment'),
    status: propertyStatusEnum.default('Active'),
    ownershipPercentage: safeNumberSchema(z.number().min(0, 'Percentage cannot be negative').max(100, 'Percentage cannot exceed 100')).default(100),
    managementCompany: z.string().max(255).default('Apex Property Management'),
    address: z.string().min(1, 'Address is required').max(500),
    streetAddress: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).default('USA'),
    zip: z.string().max(20).optional(),
    nycBin: z.string().max(50).optional(),
    yearBuilt: safeNumberSchema(z.number().int().min(1700, 'Year built must be at least 1700').max(new Date().getFullYear() + 5, 'Year built is invalid')).default(2020),
    squareFootage: safeNumberSchema(z.number().min(0, 'Square footage cannot be negative')).default(10000),
    purchasePrice: safeNumberSchema(z.number().min(0, 'Purchase price cannot be negative')).default(1000000),
    currentValue: safeNumberSchema(z.number().min(0, 'Current value cannot be negative')).default(1200000),
    monthlyExpenses: safeNumberSchema(z.number().min(0, 'Monthly expenses cannot be negative')).default(0),
    ownerId: z.string({ required_error: 'Owner ID is required' }).uuid('Invalid Owner ID format'),
    totalFloors: safeNumberSchema(z.number().min(1)).optional(),
    totalBuildings: safeNumberSchema(z.number().min(1)).optional(),
    totalUnits: safeNumberSchema(z.number().min(1)).optional(),
    floors: safeNumberSchema(z.number().min(1)).optional(),
  }),
});

export const updatePropertySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid property ID format'),
  }),
  body: z.object({
    name: z.string().min(1, 'Property Name cannot be empty').max(255).optional(),
    type: propertyTypeEnum.optional(),
    status: propertyStatusEnum.optional(),
    ownershipPercentage: safeNumberSchema(z.number().min(0, 'Percentage cannot be negative').max(100, 'Percentage cannot exceed 100')).optional(),
    managementCompany: z.string().max(255).optional(),
    address: z.string().min(1, 'Address cannot be empty').max(500).optional(),
    streetAddress: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    zip: z.string().max(20).optional(),
    nycBin: z.string().max(50).optional(),
    yearBuilt: safeNumberSchema(z.number().int().min(1700, 'Year built must be at least 1700').max(new Date().getFullYear() + 5, 'Year built is invalid')).optional(),
    squareFootage: safeNumberSchema(z.number().min(0, 'Square footage cannot be negative')).optional(),
    purchasePrice: safeNumberSchema(z.number().min(0, 'Purchase price cannot be negative')).optional(),
    currentValue: safeNumberSchema(z.number().min(0, 'Current value cannot be negative')).optional(),
    monthlyExpenses: safeNumberSchema(z.number().min(0, 'Monthly expenses cannot be negative')).optional(),
    ownerId: z.string().uuid('Invalid Owner ID format').optional(),
    totalFloors: safeNumberSchema(z.number().min(1)).optional(),
    totalBuildings: safeNumberSchema(z.number().min(1)).optional(),
    totalUnits: safeNumberSchema(z.number().min(1)).optional(),
    floors: safeNumberSchema(z.number().min(1)).optional(),
  }),
});
