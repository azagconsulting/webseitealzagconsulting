import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import type { AppConfig } from './../src/config/app.config';

const bootstrapTestApp = async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const configService = app.get<ConfigService<AppConfig, true>>(ConfigService);

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.init();

  return { app, configService } as const;
};

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const bootstrap = await bootstrapTestApp();
    app = bootstrap.app;
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/v1 should return service metadata', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/api/v1').expect(200);

    expect(response.body).toMatchObject({
      name: 'arcto-crm-api',
    });
  });
});
