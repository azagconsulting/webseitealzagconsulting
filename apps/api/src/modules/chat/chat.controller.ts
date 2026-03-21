import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express, Response } from 'express';
import { memoryStorage } from 'multer';

import type { AuthUser } from '@/modules/auth/auth.types';
import { AllowCustomer } from '@/modules/auth/decorators/allow-customer.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';

import { ChatService } from './chat.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { CreateCustomerConversationDto } from './dto/create-customer-conversation.dto';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { ListChatConversationsDto } from './dto/list-chat-conversations.dto';
import { ListChatMessagesDto } from './dto/list-chat-messages.dto';
import { MarkChatReadDto } from './dto/mark-chat-read.dto';
import { UploadChatAttachmentDto } from './dto/upload-chat-attachment.dto';

@Controller({
  path: 'chat',
  version: '1',
})
@AllowCustomer()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations/team')
  createTeamConversation(@CurrentUser() user?: AuthUser) {
    return this.chatService.createTeamConversation(user);
  }

  @Post('conversations/direct')
  createDirectConversation(
    @Body() dto: CreateDirectConversationDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.chatService.createDirectConversation(dto, user);
  }

  @Post('conversations/customer')
  createCustomerConversation(
    @Body() dto: CreateCustomerConversationDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.chatService.createCustomerConversation(dto, user);
  }

  @Get('conversations')
  listConversations(
    @Query() dto: ListChatConversationsDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.chatService.listConversations(dto, user);
  }

  @Get('conversations/:conversationId/messages')
  listMessages(
    @Param('conversationId') conversationId: string,
    @Query() dto: ListChatMessagesDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.chatService.listMessages(conversationId, dto, user);
  }

  @Get('conversations/:conversationId/read-states')
  listReadStates(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.chatService.listReadStates(conversationId, user);
  }

  @Post('conversations/:conversationId/messages')
  sendMessage(
    @Param('conversationId') conversationId: string,
    @Body() dto: CreateChatMessageDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.chatService.sendMessage(conversationId, dto, user);
  }

  @Post('conversations/:conversationId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  uploadAttachment(
    @Param('conversationId') conversationId: string,
    @Body() dto: UploadChatAttachmentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user?: AuthUser,
  ) {
    if (!file) {
      throw new BadRequestException('Datei fehlt.');
    }
    return this.chatService.uploadAttachment(conversationId, file, dto, user);
  }

  @Post('conversations/:conversationId/read')
  markRead(
    @Param('conversationId') conversationId: string,
    @Body() dto: MarkChatReadDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.chatService.markRead(conversationId, dto, user);
  }

  @Get('attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
    @CurrentUser() user?: AuthUser,
  ) {
    const download = await this.chatService.downloadAttachment(
      attachmentId,
      user,
    );
    res.setHeader('Content-Type', download.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(download.fileName)}"`,
    );
    res.setHeader('Content-Length', download.size.toString());
    download.stream.pipe(res);
  }
}
