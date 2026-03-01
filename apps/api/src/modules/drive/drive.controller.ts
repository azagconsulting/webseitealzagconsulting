import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express, Response } from 'express';
import { memoryStorage } from 'multer';

import type { AuthUser } from '@/modules/auth/auth.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';

import { DriveService } from './drive.service';
import { ListDriveFilesDto } from './dto/list-drive-files.dto';
import { UpdateDriveFileDto } from './dto/update-drive-file.dto';
import { UploadDriveFileDto } from './dto/upload-drive-file.dto';
import { CreateDriveFolderDto, UpdateDriveFolderDto } from './dto/folder.dto';

@Controller({
  path: 'drive',
  version: '1',
})
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Get('teams')
  listTeams(@CurrentUser() user?: AuthUser) {
    return this.driveService.listTeams(user);
  }

  @Get('files')
  listFiles(@Query() dto: ListDriveFilesDto, @CurrentUser() user?: AuthUser) {
    return this.driveService.listFiles(dto, user);
  }

  @Post('files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  upload(
    @Body() dto: UploadDriveFileDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user?: AuthUser,
  ) {
    if (!file) {
      throw new BadRequestException('Datei fehlt.');
    }
    return this.driveService.uploadFile(dto, file, user);
  }

  @Patch('files/:id')
  rename(
    @Param('id') id: string,
    @Body() dto: UpdateDriveFileDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.driveService.renameFile(id, dto, user);
  }

  @Delete('files/:id')
  remove(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.driveService.deleteFile(id, user);
  }

  @Get('files/:id/download')
  async download(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() user?: AuthUser,
  ) {
    const download = await this.driveService.getDownloadStream(id, user);
    res.setHeader('Content-Type', download.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(download.fileName)}"`,
    );
    res.setHeader('Content-Length', download.size.toString());
    download.stream.pipe(res);
  }

  @Get('folders')
  listFolders(@Query() dto: ListDriveFilesDto, @CurrentUser() user?: AuthUser) {
    return this.driveService.listFolders(dto, user);
  }

  @Post('folders')
  createFolder(@Body() dto: CreateDriveFolderDto, @CurrentUser() user?: AuthUser) {
    return this.driveService.createFolder(dto, user);
  }

  @Patch('folders/:id')
  updateFolder(
    @Param('id') id: string,
    @Body() dto: UpdateDriveFolderDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.driveService.updateFolder(id, dto, user);
  }

  @Delete('folders/:id')
  deleteFolder(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.driveService.deleteFolder(id, user);
  }
}
