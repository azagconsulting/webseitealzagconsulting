import { Module } from '@nestjs/common';

import { DriveModule } from '../drive/drive.module';
import { SettingsModule } from '../settings/settings.module';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { PublicBlogController } from './public-blog.controller';

@Module({
  imports: [DriveModule, SettingsModule],
  controllers: [BlogController, PublicBlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
