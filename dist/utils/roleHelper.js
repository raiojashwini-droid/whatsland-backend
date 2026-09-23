"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureRole = ensureRole;
const database_1 = __importDefault(require("../config/database"));
/**
 * Ensures that a role with the given name exists in the database.
 * Never falls back to a random role (e.g. Tenant).
 */
async function ensureRole(roleName) {
    const normalized = roleName.trim();
    let role = await database_1.default.role.findFirst({
        where: { name: normalized }
    });
    if (!role) {
        role = await database_1.default.role.create({
            data: {
                name: normalized,
                description: `${normalized} system role`,
                isCustom: false,
            }
        });
    }
    return role;
}
