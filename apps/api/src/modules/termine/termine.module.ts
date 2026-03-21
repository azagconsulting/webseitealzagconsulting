import { Module } from '@nestjs/common';

import { MailerModule } from '../../infra/mailer/mailer.module';
import { SettingsModule } from '../settings/settings.module';
import { TermineController } from './termine.controller';
import { TermineService } from './termine.service';

@Module({
  imports: [MailerModule, SettingsModule],
  controllers: [TermineController],
  providers: [TermineService],
})
export class TermineModule {}
