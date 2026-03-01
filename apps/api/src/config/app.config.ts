import { join } from 'node:path';

import type { EnvConfig } from './env.validation';

export const appConfig = () => {
  const driveRoot =
    process.env.DRIVE_STORAGE_ROOT ?? join(process.cwd(), 'storage', 'drive');

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    app: {
      name: 'arcto-crm-api',
      port: Number(process.env.PORT ?? 4000),
      url: process.env.API_URL ?? 'http://localhost:4000',
    },
    frontend: {
      url: process.env.APP_URL ?? 'http://localhost:3000',
    },
    auth: {
      jwt: {
        secret: process.env.JWT_SECRET as string,
        expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
      },
      refresh: {
        secret: process.env.JWT_REFRESH_SECRET as string,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
      },
    },
    drive: {
      storageRoot: driveRoot,
      publicUrl: process.env.DRIVE_PUBLIC_URL ?? null,
    },
    googleDrive: {
      clientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? null,
      clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? null,
      redirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI ?? null,
      maxFileSizeMb: Number(process.env.GOOGLE_DRIVE_MAX_FILE_SIZE_MB ?? 25),
    },
  };
};

export type AppConfig = ReturnType<typeof appConfig> & EnvConfig;
