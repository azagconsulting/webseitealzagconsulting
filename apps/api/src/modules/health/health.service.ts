import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async checkDatabase() {
    const startedAt = performance.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latency = Number((performance.now() - startedAt).toFixed(2));
      return {
        status: 'up',
        latency,
      };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }

  checkUptime() {
    return {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
