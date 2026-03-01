import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '@/modules/auth/decorators/public.decorator';

import { ListGoogleDriveFilesDto } from './dto/list-google-drive-files.dto';
import { GoogleDriveService } from './google-drive.service';

@Controller({
  path: 'drive/google',
  version: '1',
})
export class GoogleDriveController {
  constructor(private readonly googleDriveService: GoogleDriveService) {}

  @Get('status')
  getStatus() {
    return this.googleDriveService.getStatus();
  }

  @Get('auth-url')
  getAuthUrl(@Query('returnTo') returnTo?: string) {
    return this.googleDriveService.createAuthUrl(returnTo);
  }

  @Public()
  @Get('oauth/callback')
  async handleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      throw new BadRequestException('OAuth-Parameter fehlen.');
    }
    const redirectUrl = await this.googleDriveService.handleOAuthCallback(
      code,
      state,
    );
    res.redirect(redirectUrl);
  }

  @Post('disconnect')
  disconnect() {
    return this.googleDriveService.disconnect();
  }

  @Get('shared-drives')
  listSharedDrives() {
    return this.googleDriveService.listSharedDrives();
  }

  @Get('files')
  listFiles(@Query() dto: ListGoogleDriveFilesDto) {
    return this.googleDriveService.listFiles(dto);
  }

  @Get('files/:id/download')
  async download(
    @Param('id') id: string,
    @Query('driveId') driveId: string | undefined,
    @Res() res: Response,
  ) {
    const download = await this.googleDriveService.downloadFile(id, driveId);
    res.setHeader('Content-Type', download.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(download.fileName)}"`,
    );
    if (download.size) {
      res.setHeader('Content-Length', download.size.toString());
    }
    download.stream.pipe(res);
  }
}
