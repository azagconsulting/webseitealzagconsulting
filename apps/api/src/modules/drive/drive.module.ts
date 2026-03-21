import { Module } from '@nestjs/common';

import { DriveController } from './drive.controller';
import { DriveService } from './drive.service';
import { DriveStorageService } from './drive-storage.service';
import { GoogleDriveController } from './google-drive.controller';
import { GoogleDriveService } from './google-drive.service';

@Module({
  controllers: [DriveController, GoogleDriveController],
  providers: [DriveService, DriveStorageService, GoogleDriveService],
  exports: [DriveService, DriveStorageService, GoogleDriveService],
})
export class DriveModule {}
