import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { ListCustomerMessagesDto } from './dto/list-customer-messages.dto';
import { SendCustomerMessageDto } from './dto/send-customer-message.dto';
import { CustomerMessagesService } from './customer-messages.service';

@Controller({
  path: 'leads/:leadId/messages',
  version: '1',
})
export class LeadMessagesController {
  constructor(private readonly messagesService: CustomerMessagesService) {}

  @Get()
  list(
    @Param('leadId') leadId: string,
    @Query() query: ListCustomerMessagesDto,
  ) {
    return this.messagesService.listLeadMessages(leadId, query);
  }

  @Post()
  send(@Param('leadId') leadId: string, @Body() dto: SendCustomerMessageDto) {
    return this.messagesService.sendLeadMessage(leadId, dto);
  }
}
