import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { ListCustomerMessagesDto } from './dto/list-customer-messages.dto';
import { SendCustomerMessageDto } from './dto/send-customer-message.dto';
import { CustomerMessagesService } from './customer-messages.service';

@Controller({
  path: 'customers/:customerId/messages',
  version: '1',
})
export class CustomerMessagesController {
  constructor(private readonly messagesService: CustomerMessagesService) {}

  @Get()
  list(
    @Param('customerId') customerId: string,
    @Query() query: ListCustomerMessagesDto,
  ) {
    return this.messagesService.list(customerId, query);
  }

  @Post()
  send(
    @Param('customerId') customerId: string,
    @Body() dto: SendCustomerMessageDto,
  ) {
    return this.messagesService.send(customerId, dto);
  }
}
