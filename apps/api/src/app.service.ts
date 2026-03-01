import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from './config/app.config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  getInfo() {
    const app = this.configService.get('app', { infer: true });

    return {
      name: app?.name ?? 'arcto-crm-api',
      version: process.env.npm_package_version ?? '0.0.1',
      environment: this.configService.get('nodeEnv', { infer: true }),
      url: app?.url ?? this.configService.get('API_URL'),
      timestamp: new Date().toISOString(),
    };
  }
}
