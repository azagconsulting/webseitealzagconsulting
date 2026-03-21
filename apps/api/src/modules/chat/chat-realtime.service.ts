import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';

import type {
  ChatMessageResponse,
  ChatReadStateResponse,
} from './chat.service';

type ChatConversationChangedReason =
  | 'conversation_created'
  | 'message_created'
  | 'read_updated';

@Injectable()
export class ChatRealtimeService {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  clearServer(server: Server) {
    if (this.server === server) {
      this.server = null;
    }
  }

  buildUserRoom(tenantId: string, userId: string) {
    return `tenant:${tenantId}:user:${userId}`;
  }

  buildConversationRoom(tenantId: string, conversationId: string) {
    return `tenant:${tenantId}:conversation:${conversationId}`;
  }

  joinUserRoom(socket: Socket, tenantId: string, userId: string) {
    void socket.join(this.buildUserRoom(tenantId, userId));
  }

  joinConversationRoom(
    socket: Socket,
    tenantId: string,
    conversationId: string,
  ) {
    void socket.join(this.buildConversationRoom(tenantId, conversationId));
  }

  leaveConversationRoom(
    socket: Socket,
    tenantId: string,
    conversationId: string,
  ) {
    void socket.leave(this.buildConversationRoom(tenantId, conversationId));
  }

  emitMessageCreated(params: {
    tenantId: string;
    conversationId: string;
    participantUserIds: string[];
    message: ChatMessageResponse;
  }) {
    this.emitToParticipants(
      params.tenantId,
      params.participantUserIds,
      'chat:message.created',
      {
        conversationId: params.conversationId,
        message: params.message,
      },
    );
  }

  emitReadUpdated(params: {
    tenantId: string;
    conversationId: string;
    participantUserIds: string[];
    state: ChatReadStateResponse;
  }) {
    this.emitToParticipants(
      params.tenantId,
      params.participantUserIds,
      'chat:read.updated',
      {
        conversationId: params.conversationId,
        state: params.state,
      },
    );
  }

  emitConversationChanged(params: {
    tenantId: string;
    conversationId: string;
    participantUserIds: string[];
    reason: ChatConversationChangedReason;
    actorUserId?: string;
  }) {
    this.emitToParticipants(
      params.tenantId,
      params.participantUserIds,
      'chat:conversation.changed',
      {
        conversationId: params.conversationId,
        reason: params.reason,
        actorUserId: params.actorUserId ?? null,
        changedAt: new Date().toISOString(),
      },
    );
  }

  emitTypingUpdated(params: {
    tenantId: string;
    conversationId: string;
    participantUserIds: string[];
    userId: string;
    isTyping: boolean;
  }) {
    this.emitToParticipants(
      params.tenantId,
      params.participantUserIds,
      'chat:typing.updated',
      {
        conversationId: params.conversationId,
        userId: params.userId,
        isTyping: params.isTyping,
        updatedAt: new Date().toISOString(),
      },
      {
        excludeUserIds: [params.userId],
      },
    );
  }

  private emitToParticipants(
    tenantId: string,
    participantUserIds: string[],
    event: string,
    payload: Record<string, unknown>,
    options?: {
      excludeUserIds?: string[];
    },
  ) {
    if (!this.server) {
      return;
    }
    const excluded = new Set((options?.excludeUserIds ?? []).filter(Boolean));
    const userIds = Array.from(new Set(participantUserIds.filter(Boolean)));
    for (const userId of userIds) {
      if (excluded.has(userId)) {
        continue;
      }
      this.server.to(this.buildUserRoom(tenantId, userId)).emit(event, payload);
    }
  }
}
