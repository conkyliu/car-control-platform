import { PrismaClient } from '@prisma/client';
import { TenantContext } from './tenant-context.js';

let globalPrisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!globalPrisma) {
    globalPrisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return globalPrisma;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (globalPrisma) {
    await globalPrisma.$disconnect();
    globalPrisma = null;
  }
}

export { PrismaClient } from '@prisma/client';
