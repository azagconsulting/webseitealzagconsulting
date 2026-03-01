import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../auth/decorators/public.decorator';
import { ChatbotService } from './chatbot.service';
import { SendChatbotMessageDto } from './dto/send-chatbot-message.dto';

@Public()
@Controller({
  path: 'chatbot',
  version: '1',
})
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Get('config')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async getConfig() {
    return this.chatbotService.getPublicConfig();
  }

  @Post('message')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async sendMessage(@Body() dto: SendChatbotMessageDto) {
    return this.chatbotService.sendMessage(dto);
  }
}
