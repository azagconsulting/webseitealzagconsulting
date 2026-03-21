import { Module } from '@nestjs/common';

import { MailSyncService } from './mail-sync.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [MailSyncService],
})
export class MailSyncModule {}
