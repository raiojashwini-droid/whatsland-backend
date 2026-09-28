import app from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import prisma from './config/database';
import cron from 'node-cron';
import { autoHealMissingCompanyIds } from './utils/companyHelper.js';
import { generateAutoInvoices, generateAutoLateFees } from './services/billingAutomation.service';

async function bootstrapDb() {
  try {
    logger.info('⚙️ Bootstrapping database schema with new columns...');
    
    const ownerCols = [
      'ALTER TABLE owner_documents ADD COLUMN ownerId VARCHAR(191) NULL;',
      'ALTER TABLE owner_documents ADD COLUMN propertyId VARCHAR(191) NULL;',
      'ALTER TABLE owner_documents ADD COLUMN companyId VARCHAR(191) NULL;'
    ];

    for (const sql of ownerCols) {
      await prisma.$executeRawUnsafe(sql).catch((e: any) => {
        // Ignore duplicate column error (1060) or already existing column warnings
        if (!e.message.includes('1060') && !e.message.includes('Duplicate column')) {
          logger.warn(`DDL execution warning: ${e.message}`);
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
      await prisma.$executeRawUnsafe(sql).catch((e: any) => {
        if (!e.message.includes('1060') && !e.message.includes('Duplicate column')) {
          logger.warn(`DDL execution warning: ${e.message}`);
        }
      });
    }

    logger.info('✅ Database schema bootstrap completed.');
  } catch (error) {
    logger.error(error, '❌ Failed to bootstrap database schema:');
  }
}

// Connect and verify database connection
prisma.$connect()
  .then(async () => {
    logger.info('🔌 MySQL Database connected successfully via Prisma Client!');
    await bootstrapDb();
    await autoHealMissingCompanyIds();

    // Start background auto-billing on server start (America/New_York)
    generateAutoInvoices().catch(e => logger.error(e, 'Auto-invoices startup error'));
    generateAutoLateFees().catch(e => logger.error(e, 'Auto-late-fees startup error'));

    // Schedule daily cron job at 00:05 AM US Eastern Time (America/New_York)
    cron.schedule('5 0 * * *', () => {
      logger.info('⏰ Running daily midnight billing cron (America/New_York)...');
      generateAutoInvoices().catch(e => logger.error(e, 'Cron auto-invoices error'));
      generateAutoLateFees().catch(e => logger.error(e, 'Cron auto-late-fees error'));
    }, {
      timezone: 'America/New_York'
    });

    // Schedule 12:14 PM IST Test Cron
    cron.schedule('14 12 * * *', () => {
      logger.info('⏰ Running scheduled 12:14 PM IST test billing cron...');
      generateAutoInvoices().catch(e => logger.error(e, '12:14 PM auto-invoices error'));
      generateAutoLateFees().catch(e => logger.error(e, '12:14 PM auto-late-fees error'));
    }, {
      timezone: 'Asia/Kolkata'
    });

    // 1-minute interval background check for live testing
    cron.schedule('* * * * *', () => {
      logger.info('⏰ Running 1-minute background billing check...');
      generateAutoInvoices().catch(e => logger.error(e, '1-min auto-invoices error'));
      generateAutoLateFees().catch(e => logger.error(e, '1-min auto-late-fees error'));
    });
  })
  .catch((error: Error) => {
    logger.error(error, '❌ Failed to connect to the MySQL database:');
  });

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 WhatsLandlord ERP Backend Server running on http://localhost:${env.PORT}${env.API_PREFIX}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
});

server.on('error', (error: any) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`❌ Port ${env.PORT} is already in use by another process.`);
    process.exit(1);
  } else {
    logger.error(error, 'Server error:');
  }
});

process.on('unhandledRejection', (reason: Error) => {
  logger.error(reason, 'Unhandled Rejection caught:');
});

process.on('uncaughtException', (error: Error) => {
  logger.error(error, 'Uncaught Exception caught:');
  process.exit(1);
});
