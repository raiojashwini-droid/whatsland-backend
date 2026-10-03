import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  throw new Error('DISABLED FOR SAFETY: clear_db script has been disabled to protect production database data from data loss.');
}

main();
