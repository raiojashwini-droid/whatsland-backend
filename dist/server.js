"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const database_1 = __importDefault(require("./config/database"));
const node_cron_1 = __importDefault(require("node-cron"));
const companyHelper_js_1 = require("./utils/companyHelper.js");
const billingAutomation_service_1 = require("./services/billingAutomation.service");
async function bootstrapDb() {
    try {
        logger_1.logger.info('⚙️ Bootstrapping database schema with new columns...');
        const ownerCols = [
            'ALTER TABLE owner_documents ADD COLUMN ownerId VARCHAR(191) NULL;',
            'ALTER TABLE owner_documents ADD COLUMN propertyId VARCHAR(191) NULL;',
            'ALTER TABLE owner_documents ADD COLUMN companyId VARCHAR(191) NULL;'
        ];
        for (const sql of ownerCols) {
            await database_1.default.$executeRawUnsafe(sql).catch((e) => {
                // Ignore duplicate column error (1060) or already existing column warnings
                if (!e.message.includes('1060') && !e.message.includes('Duplicate column')) {
                    logger_1.logger.warn(`DDL execution warning: ${e.message}`);
                }
            });
        }
        const tenantCols = [
            'ALTER TABLE tenant_documents ADD COLUMN tenantId VARCHAR(191) NULL;',
            'ALTER TABLE tenant_documents ADD COLUMN propertyId VARCHAR(191) NULL;',
            'ALTER TABLE tenant_documents ADD COLUMN buildingId VARCHAR(191) NULL;',
            'ALTER TABLE tenant_documents ADD COLUMN unitId VARCHAR(191) NULL;',
            'ALTER TABLE tenant_documents ADD COLUMN companyId VARCHAR(191) NULL;'
        ];
        for (const sql of tenantCols) {
            await database_1.default.$executeRawUnsafe(sql).catch((e) => {
                if (!e.message.includes('1060') && !e.message.includes('Duplicate column')) {
                    logger_1.logger.warn(`DDL execution warning: ${e.message}`);
                }
            });
        }
        logger_1.logger.info('✅ Database schema bootstrap completed.');
    }
    catch (error) {
        logger_1.logger.error(error, '❌ Failed to bootstrap database schema:');
    }
}
// Connect and verify database connection
database_1.default.$connect()
    .then(async () => {
    logger_1.logger.info('🔌 MySQL Database connected successfully via Prisma Client!');
    await bootstrapDb();
    await (0, companyHelper_js_1.autoHealMissingCompanyIds)();
    // Start background auto-billing on server start (America/New_York)
    (0, billingAutomation_service_1.generateAutoInvoices)().catch(e => logger_1.logger.error(e, 'Auto-invoices startup error'));
    (0, billingAutomation_service_1.generateAutoLateFees)().catch(e => logger_1.logger.error(e, 'Auto-late-fees startup error'));
    // Schedule daily cron job at 00:05 AM US Eastern Time (America/New_York)
    node_cron_1.default.schedule('5 0 * * *', () => {
        logger_1.logger.info('⏰ Running daily midnight billing cron (America/New_York)...');
        (0, billingAutomation_service_1.generateAutoInvoices)().catch(e => logger_1.logger.error(e, 'Cron auto-invoices error'));
        (0, billingAutomation_service_1.generateAutoLateFees)().catch(e => logger_1.logger.error(e, 'Cron auto-late-fees error'));
    }, {
        timezone: 'America/New_York'
    });
    // Schedule 12:14 PM IST Test Cron
    node_cron_1.default.schedule('14 12 * * *', () => {
        logger_1.logger.info('⏰ Running scheduled 12:14 PM IST test billing cron...');
        (0, billingAutomation_service_1.generateAutoInvoices)().catch(e => logger_1.logger.error(e, '12:14 PM auto-invoices error'));
        (0, billingAutomation_service_1.generateAutoLateFees)().catch(e => logger_1.logger.error(e, '12:14 PM auto-late-fees error'));
    }, {
        timezone: 'Asia/Kolkata'
    });
    // 1-minute interval background check for live testing
    node_cron_1.default.schedule('* * * * *', () => {
        logger_1.logger.info('⏰ Running 1-minute background billing check...');
        (0, billingAutomation_service_1.generateAutoInvoices)().catch(e => logger_1.logger.error(e, '1-min auto-invoices error'));
        (0, billingAutomation_service_1.generateAutoLateFees)().catch(e => logger_1.logger.error(e, '1-min auto-late-fees error'));
    });
})
    .catch((error) => {
    logger_1.logger.error(error, '❌ Failed to connect to the MySQL database:');
});
const server = app_1.default.listen(env_1.env.PORT, () => {
    logger_1.logger.info(`🚀 WhatsLandlord ERP Backend Server running on http://localhost:${env_1.env.PORT}${env_1.env.API_PREFIX}`);
    logger_1.logger.info(`Environment: ${env_1.env.NODE_ENV}`);
});
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        logger_1.logger.error(`❌ Port ${env_1.env.PORT} is already in use by another process.`);
        process.exit(1);
    }
    else {
        logger_1.logger.error(error, 'Server error:');
    }
});
process.on('unhandledRejection', (reason) => {
    logger_1.logger.error(reason, 'Unhandled Rejection caught:');
});
process.on('uncaughtException', (error) => {
    logger_1.logger.error(error, 'Uncaught Exception caught:');
    process.exit(1);
});
