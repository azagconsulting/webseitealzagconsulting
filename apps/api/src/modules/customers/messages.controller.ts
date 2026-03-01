import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { ListCustomerMessagesDto } from './dto/list-customer-messages.dto';
import { MarkMessagesReadDto } from './dto/mark-messages-read.dto';
import { SendCustomerMessageDto } from './dto/send-customer-message.dto';
import { MarkMessagesTrashDto } from './dto/mark-messages-trash.dto';
import { CustomerMessagesService } from './customer-messages.service';

@Controller({
  path: 'messages',
  version: '1',
})
export class MessagesController {
  constructor(private readonly messagesService: CustomerMessagesService) {}

  @Get('by-email')
  getByEmail(@Query('email') email?: string) {
    if (!email?.trim()) {
      return [];
    }
    return this.messagesService.listByEmail(email);
  }

  @Get('sent')
  listSent(@Query() query: ListCustomerMessagesDto) {
    return this.messagesService.listSent(query);
  }

  @Get('inbox')
  listInbox(@Query() query: ListCustomerMessagesDto) {
    return this.messagesService.listInbox(query);
  }

  @Get('spam')
  listSpam(@Query() query: ListCustomerMessagesDto) {
    return this.messagesService.listSpam(query);
  }

  @Get('trash')
  listTrash(@Query() query: ListCustomerMessagesDto) {
    return this.messagesService.listTrash(query);
  }

  @Get('unassigned')
  listUnassigned(@Query() query: ListCustomerMessagesDto) {
    return this.messagesService.listUnassignedMessages(query);
  }

  @Post('unassigned')
  sendUnassigned(@Body() dto: SendCustomerMessageDto) {
    return this.messagesService.sendUnassignedMessage(dto);
  }

  @Post('read')
  markRead(@Body() dto: MarkMessagesReadDto) {
    return this.messagesService.markMessagesRead(dto.ids);
  }

  @Post('trash')
  moveToTrash(@Body() dto: MarkMessagesTrashDto) {
    return this.messagesService.moveMessagesToTrash(dto.ids);
  }

  @Post('trash/restore')
  restoreFromTrash(@Body() dto: MarkMessagesTrashDto) {
    return this.messagesService.restoreMessagesFromTrash(dto.ids);
  }

  @Post(':messageId/customer-extraction')
  extractCustomer(@Param('messageId') messageId: string) {
    return this.messagesService.extractCustomerFromMessage(messageId);
  }

  @Get('unread-summary')
  unreadSummary() {
    return this.messagesService.getUnreadSummary();
  }
}
