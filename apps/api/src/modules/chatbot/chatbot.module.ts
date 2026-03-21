import { Module } from '@nestjs/common';

import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { MailerModule } from '../../infra/mailer/mailer.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PrismaModule, MailerModule, SettingsModule],
  controllers: [ChatbotController],
  providers: [ChatbotService],
})
export class ChatbotModule {}
