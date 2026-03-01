import { Controller, Get } from '@nestjs/common';

import { HealthService } from './health.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller({
  path: 'health',
  version: '1',
})
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  async check() {
    const db = await this.healthService.checkDatabase();
    const uptime = this.healthService.checkUptime();

    return {
      status: 'ok',
      ...uptime,
      database: db,
    };
  }
}
