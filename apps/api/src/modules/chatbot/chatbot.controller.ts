import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../auth/decorators/public.decorator';
import { ChatbotService } from './chatbot.service';
import { CancelChatbotAppointmentDto } from './dto/cancel-chatbot-appointment.dto';
import { CancelChatbotAppointmentQueryDto } from './dto/cancel-chatbot-appointment-query.dto';
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

  @Get('appointments/cancel')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async cancelAppointmentByLink(
    @Query() query: CancelChatbotAppointmentQueryDto,
  ) {
    const result = await this.chatbotService.cancelAppointmentByToken(
      query.token,
    );
    return this.chatbotService.renderCancelAppointmentResultHtml(result);
  }

  @Post('appointments/cancel')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async cancelAppointment(@Body() dto: CancelChatbotAppointmentDto) {
    return this.chatbotService.cancelAppointmentByToken(dto.token);
  }
}
