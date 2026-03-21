import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';

import type { AppConfig } from '@/config/app.config';

@Injectable()
export class DriveStorageService {
  private readonly storageRoot: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const driveConfig = this.configService.get('drive', { infer: true });
    this.storageRoot = driveConfig?.storageRoot ?? join(process.cwd(), 'drive');
  }

  private resolvePath(storageKey: string) {
    return join(this.storageRoot, storageKey);
  }

  private folderFor(tenantId: string) {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return join(tenantId, year, month);
  }

  private sanitizeExtension(filename?: string | null) {
    if (!filename) {
      return '';
    }
    const ext = extname(filename);
    if (!ext) {
      return '';
    }
    return ext.slice(0, 16);
  }

  async saveFile(params: {
    tenantId: string;
    buffer: Buffer;
    originalName?: string;
  }): Promise<string> {
    const folder = this.folderFor(params.tenantId);
    const storageKey = join(
      folder,
      `${randomUUID()}${this.sanitizeExtension(params.originalName)}`,
    );
    const absolutePath = this.resolvePath(storageKey);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, params.buffer);
    return storageKey;
  }

  async deleteFile(storageKey: string) {
    try {
      await rm(this.resolvePath(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  async openFile(storageKey: string) {
    const absolutePath = this.resolvePath(storageKey);
    try {
      const stats = await stat(absolutePath);
      return {
        stream: createReadStream(absolutePath),
        size: stats.size,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Datei nicht gefunden.');
      }
      throw error;
    }
  }
}
