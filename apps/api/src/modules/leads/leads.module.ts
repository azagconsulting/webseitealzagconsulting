import { Module } from '@nestjs/common';

import { MailerModule } from '../../infra/mailer/mailer.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { PublicContactController } from './public-contact.controller';

@Module({
  imports: [UsersModule, MailerModule, SettingsModule],
  controllers: [LeadsController, PublicContactController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
