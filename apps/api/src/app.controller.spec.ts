import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';
import { AppService } from './app.service';

const mockConfig = {
  nodeEnv: 'test',
  app: {
    name: 'arcto-crm-api',
    port: 4000,
    url: 'http://localhost:4000',
  },
};

const configGetMock = jest.fn(
  (key: keyof typeof mockConfig) => mockConfig[key],
);

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    configGetMock.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: {
            get: configGetMock,
          },
        },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should expose service metadata', () => {
      const response = appController.getRoot();

      expect(configGetMock).toHaveBeenCalledWith('app', { infer: true });
      expect(response).toMatchObject({
        name: 'arcto-crm-api',
        environment: 'test',
      });
    });
  });
});
