import { Module } from '@nestjs/common';

import { MailerModule } from '../../infra/mailer/mailer.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PrismaModule, MailerModule, SettingsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
