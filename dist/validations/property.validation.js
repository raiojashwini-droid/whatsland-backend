"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePropertySchema = exports.createPropertySchema = void 0;
const zod_1 = require("zod");
const validationHelpers_1 = require("./validationHelpers");
const propertyTypeEnum = zod_1.z.enum([
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
const propertyStatusEnum = zod_1.z.enum([
    'Active',
    'Inactive',
    'Under Review',
    'Archived',
    'Draft',
]);
exports.createPropertySchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string({ required_error: 'Property Name is required' }).min(1, 'Property Name is required').max(255),
        type: propertyTypeEnum.default('Apartment'),
        status: propertyStatusEnum.default('Active'),
        ownershipPercentage: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Percentage cannot be negative').max(100, 'Percentage cannot exceed 100')).default(100),
        managementCompany: zod_1.z.string().max(255).default('Apex Property Management'),
        address: zod_1.z.string().min(1, 'Address is required').max(500),
        streetAddress: zod_1.z.string().max(255).optional(),
        city: zod_1.z.string().max(100).optional(),
        state: zod_1.z.string().max(100).optional(),
        country: zod_1.z.string().max(100).default('USA'),
        zip: zod_1.z.string().max(20).optional(),
        nycBin: zod_1.z.string().max(50).optional(),
        yearBuilt: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().int().min(1700, 'Year built must be at least 1700').max(new Date().getFullYear() + 5, 'Year built is invalid')).default(2020),
        squareFootage: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Square footage cannot be negative')).default(10000),
        purchasePrice: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Purchase price cannot be negative')).default(1000000),
        currentValue: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Current value cannot be negative')).default(1200000),
        monthlyExpenses: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Monthly expenses cannot be negative')).default(0),
        ownerId: zod_1.z.string({ required_error: 'Owner ID is required' }).uuid('Invalid Owner ID format'),
    }),
});
exports.updatePropertySchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Invalid property ID format'),
    }),
    body: zod_1.z.object({
        name: zod_1.z.string().min(1, 'Property Name cannot be empty').max(255).optional(),
        type: propertyTypeEnum.optional(),
        status: propertyStatusEnum.optional(),
        ownershipPercentage: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Percentage cannot be negative').max(100, 'Percentage cannot exceed 100')).optional(),
        managementCompany: zod_1.z.string().max(255).optional(),
        address: zod_1.z.string().min(1, 'Address cannot be empty').max(500).optional(),
        streetAddress: zod_1.z.string().max(255).optional(),
        city: zod_1.z.string().max(100).optional(),
        state: zod_1.z.string().max(100).optional(),
        country: zod_1.z.string().max(100).optional(),
        zip: zod_1.z.string().max(20).optional(),
        nycBin: zod_1.z.string().max(50).optional(),
        yearBuilt: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().int().min(1700, 'Year built must be at least 1700').max(new Date().getFullYear() + 5, 'Year built is invalid')).optional(),
        squareFootage: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Square footage cannot be negative')).optional(),
        purchasePrice: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Purchase price cannot be negative')).optional(),
        currentValue: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Current value cannot be negative')).optional(),
        monthlyExpenses: (0, validationHelpers_1.safeNumberSchema)(zod_1.z.number().min(0, 'Monthly expenses cannot be negative')).optional(),
        ownerId: zod_1.z.string().uuid('Invalid Owner ID format').optional(),
    }),
});
