import {
  BadRequestException,
  Delete,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFiles,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Express, Response } from 'express';
import { memoryStorage } from 'multer';

import { AllowCustomer } from '@/modules/auth/decorators/allow-customer.decorator';

import { CustomerPortalService } from './customer-portal.service';
import { UpdateProjectProfileDto } from './dto/update-project-profile.dto';

@Controller({
  path: 'customer-portal',
  version: '1',
})
@AllowCustomer()
export class CustomerPortalController {
  constructor(private readonly customerPortalService: CustomerPortalService) {}

  @Get('home')
  getHome() {
    return this.customerPortalService.getHome();
  }

  @Get('files')
  listFiles() {
    return this.customerPortalService.listFiles();
  }

  @Get('project-profile')
  getProjectProfile() {
    return this.customerPortalService.getProjectProfile();
  }

  @Patch('project-profile')
  updateProjectProfile(@Body() dto: UpdateProjectProfileDto) {
    return this.customerPortalService.updateProjectProfile(dto);
  }

  @Post('files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  uploadFile(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('name') name?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Datei fehlt.');
    }
    return this.customerPortalService.uploadFile(file, name);
  }

  @Post('project-logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  uploadProjectLogo(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('Logo-Datei fehlt.');
    }
    return this.customerPortalService.uploadProjectLogo(file);
  }

  @Delete('project-logo')
  deleteProjectLogo() {
    return this.customerPortalService.deleteProjectLogo();
  }

  @Post('project-media')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  uploadProjectMedia(
    @UploadedFiles() files: Array<Express.Multer.File> | undefined,
  ) {
    if (!files?.length) {
      throw new BadRequestException('Bildmaterial fehlt.');
    }
    return this.customerPortalService.uploadProjectMedia(files);
  }

  @Delete('project-media/:id')
  deleteProjectMedia(@Param('id') id: string) {
    return this.customerPortalService.deleteProjectMedia(id);
  }

  @Get('files/:id/download')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const download = await this.customerPortalService.getDownload(id);
    res.setHeader('Content-Type', download.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(download.fileName)}"`,
    );
    res.setHeader('Content-Length', download.size.toString());
    download.stream.pipe(res);
  }
}
