import { Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { IsBoolean, IsUUID } from 'class-validator';
import type { Server, Socket } from 'socket.io';
import { UserRole } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RequestContextService } from '@/infra/request-context/request-context.service';
import type { AuthUser, JwtPayload } from '@/modules/auth/auth.types';

import { ChatRealtimeService } from './chat-realtime.service';
import { ChatService } from './chat.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { MarkChatReadDto } from './dto/mark-chat-read.dto';

type ChatSocket = Socket;

class ChatConversationSocketDto {
  @IsUUID()
  conversationId!: string;
}

class ChatSendMessageSocketDto extends CreateChatMessageDto {
  @IsUUID()
  conversationId!: string;
}

class ChatReadSocketDto extends MarkChatReadDto {
  @IsUUID()
  conversationId!: string;
}

class ChatTypingSocketDto {
  @IsUUID()
  conversationId!: string;

  @IsBoolean()
  isTyping!: boolean;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: process.env.APP_URL ?? true,
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly context: RequestContextService,
    private readonly realtime: ChatRealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.setServer(server);
  }

  async handleConnection(client: ChatSocket) {
    try {
      const user = await this.authenticateSocket(client);
      this.setSocketUser(client, user);
      this.realtime.joinUserRoom(client, user.tenantId, user.sub);
      client.emit('chat:connected', {
        userId: user.sub,
        tenantId: user.tenantId,
        connectedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof WsException
          ? this.getWsExceptionMessage(error)
          : 'Nicht authentifiziert.';
      client.emit('chat:error', { message });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: ChatSocket) {
    const userId = this.getSocketUser(client)?.sub ?? 'unknown';
    this.logger.debug(`Socket getrennt: ${client.id} (${userId})`);
  }

  @SubscribeMessage('chat:conversation.join')
  async joinConversation(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() dto: ChatConversationSocketDto,
  ) {
    const user = this.requireSocketUser(client);
    try {
      await this.chatService.ensureConversationAccess(dto.conversationId, user);
      this.realtime.joinConversationRoom(
        client,
        user.tenantId,
        dto.conversationId,
      );
      return {
        ok: true,
        conversationId: dto.conversationId,
      };
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage('chat:conversation.leave')
  leaveConversation(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() dto: ChatConversationSocketDto,
  ) {
    const user = this.requireSocketUser(client);
    this.realtime.leaveConversationRoom(
      client,
      user.tenantId,
      dto.conversationId,
    );
    return {
      ok: true,
      conversationId: dto.conversationId,
    };
  }

  @SubscribeMessage('chat:message.send')
  async sendMessage(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() dto: ChatSendMessageSocketDto,
  ) {
    const user = this.requireSocketUser(client);
    try {
      const message = await this.runAsUserContext(user, () =>
        this.chatService.sendMessage(
          dto.conversationId,
          {
            body: dto.body,
            attachmentFileIds: dto.attachmentFileIds,
          },
          user,
        ),
      );
      return {
        ok: true,
        conversationId: dto.conversationId,
        message,
      };
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage('chat:read.mark')
  async markRead(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() dto: ChatReadSocketDto,
  ) {
    const user = this.requireSocketUser(client);
    try {
      const state = await this.runAsUserContext(user, () =>
        this.chatService.markRead(
          dto.conversationId,
          { lastReadMessageId: dto.lastReadMessageId },
          user,
        ),
      );
      return {
        ok: true,
        conversationId: dto.conversationId,
        state,
      };
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  @SubscribeMessage('chat:typing.set')
  async setTyping(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() dto: ChatTypingSocketDto,
  ) {
    const user = this.requireSocketUser(client);
    try {
      const participantUserIds = await this.runAsUserContext(user, () =>
        this.chatService.resolveParticipantUserIds(dto.conversationId, user),
      );

      this.realtime.emitTypingUpdated({
        tenantId: user.tenantId,
        conversationId: dto.conversationId,
        participantUserIds,
        userId: user.sub,
        isTyping: dto.isTyping,
      });

      return {
        ok: true,
        conversationId: dto.conversationId,
        isTyping: dto.isTyping,
      };
    } catch (error) {
      throw this.toWsException(error);
    }
  }

  private async runAsUserContext<T>(
    user: AuthUser,
    callback: () => Promise<T>,
  ): Promise<T> {
    return this.context.run(
      {
        tenantId: user.tenantId,
        userId: user.sub,
        role: user.role,
        customerId: user.customerId ?? null,
      },
      callback,
    );
  }

  private requireSocketUser(client: ChatSocket): AuthUser {
    const user = this.getSocketUser(client);
    if (!user?.sub || !user.tenantId) {
      throw new WsException('Nicht authentifiziert.');
    }
    return user;
  }

  private async authenticateSocket(client: ChatSocket): Promise<AuthUser> {
    const token = this.extractAccessToken(client);
    if (!token) {
      throw new WsException('Nicht authentifiziert.');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new WsException('Nicht authentifiziert.');
    }

    const sub = this.ensureString(payload.sub);
    const tenantId = this.ensureString(payload.tenantId);
    const email = this.ensureString(payload.email);
    const role = this.parseUserRole(payload.role);

    const user = await this.prisma.user.findFirst({
      where: {
        id: sub,
        tenantId,
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        role: true,
        customerId: true,
      },
    });

    if (!user) {
      throw new WsException('Benutzer nicht gefunden.');
    }

    return {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email || email,
      role: user.role || role,
      customerId: user.customerId,
    };
  }

  private extractAccessToken(client: ChatSocket) {
    const auth = client.handshake.auth as Record<string, unknown> | undefined;
    const authToken =
      auth && typeof auth.token === 'string' ? auth.token : null;
    if (authToken) {
      return this.normalizeToken(authToken);
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.trim()) {
      return this.normalizeToken(header);
    }

    const queryToken = client.handshake.query.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return this.normalizeToken(queryToken);
    }

    return null;
  }

  private normalizeToken(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const [scheme, token] = trimmed.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token) {
      return token;
    }
    return trimmed;
  }

  private ensureString(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    throw new WsException('Nicht authentifiziert.');
  }

  private parseUserRole(value: unknown) {
    if (typeof value !== 'string') {
      throw new WsException('Nicht authentifiziert.');
    }
    const allowed = Object.values(UserRole);
    if (allowed.includes(value as UserRole)) {
      return value as UserRole;
    }
    throw new WsException('Nicht authentifiziert.');
  }

  private toWsException(error: unknown) {
    if (error instanceof WsException) {
      return error;
    }
    if (error instanceof Error) {
      return new WsException(error.message);
    }
    return new WsException('Chat-Aktion fehlgeschlagen.');
  }

  private setSocketUser(client: ChatSocket, user: AuthUser) {
    const data = this.getSocketData(client);
    data.user = user;
  }

  private getSocketUser(client: ChatSocket) {
    return this.getSocketData(client).user;
  }

  private getSocketData(client: ChatSocket) {
    return client.data as { user?: AuthUser };
  }

  private getWsExceptionMessage(exception: WsException) {
    const raw = exception.getError();
    if (typeof raw === 'string') {
      return raw;
    }
    if (raw && typeof raw === 'object' && 'message' in raw) {
      const value = (raw as { message?: unknown }).message;
      if (typeof value === 'string') {
        return value;
      }
    }
    return 'Nicht authentifiziert.';
  }
}
