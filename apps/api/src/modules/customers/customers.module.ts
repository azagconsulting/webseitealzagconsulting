import { Module } from '@nestjs/common';

import { MailerModule } from '../../infra/mailer/mailer.module';
import { SettingsModule } from '../settings/settings.module';
import { CustomerMessagesController } from './customer-messages.controller';
import { CustomerMessagesService } from './customer-messages.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { LeadMessagesController } from './lead-messages.controller';
import { MessagesController } from './messages.controller';

@Module({
  imports: [MailerModule, SettingsModule],
  controllers: [
    CustomersController,
    CustomerMessagesController,
    LeadMessagesController,
    MessagesController,
  ],
  providers: [CustomersService, CustomerMessagesService],
  exports: [CustomersService, CustomerMessagesService],
})
export class CustomersModule {}
