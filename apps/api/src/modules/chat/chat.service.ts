import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ChatConversationType,
  DriveFolderKind,
  DriveScope,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { Express } from 'express';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RequestContextService } from '@/infra/request-context/request-context.service';
import { DriveStorageService } from '@/modules/drive/drive-storage.service';
import type { AuthUser } from '@/modules/auth/auth.types';
import { ChatRealtimeService } from './chat-realtime.service';

import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { CreateCustomerConversationDto } from './dto/create-customer-conversation.dto';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { ListChatConversationsDto } from './dto/list-chat-conversations.dto';
import { ListChatMessagesDto } from './dto/list-chat-messages.dto';
import { MarkChatReadDto } from './dto/mark-chat-read.dto';
import { UploadChatAttachmentDto } from './dto/upload-chat-attachment.dto';

const TEAM_CHAT_CONVERSATION_KEY = 'team-main';
const TEAM_CHAT_TITLE = 'Team Chat';
const TEAM_CHAT_IMAGES_SYSTEM_KEY = 'team_chat_images_internal';
const TEAM_CHAT_IMAGES_FOLDER_NAME = 'Chat Bilder (intern)';
const CHAT_ATTACHMENT_MAX_AGE_DAYS = 90;

const chatUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
} satisfies Prisma.UserSelect;

const chatConversationInclude = {
  members: {
    include: {
      user: {
        select: chatUserSelect,
      },
    },
  },
  customer: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ChatConversationInclude;

const chatMessageInclude = {
  sender: {
    select: chatUserSelect,
  },
  attachments: {
    include: {
      driveFile: {
        select: {
          id: true,
          name: true,
          mimeType: true,
          size: true,
        },
      },
    },
  },
} satisfies Prisma.ChatMessageInclude;

type ChatConversationEntity = Prisma.ChatConversationGetPayload<{
  include: typeof chatConversationInclude;
}>;

type ChatMessageEntity = Prisma.ChatMessageGetPayload<{
  include: typeof chatMessageInclude;
}>;

type ChatUserEntity = Prisma.UserGetPayload<{
  select: typeof chatUserSelect;
}>;

export interface ChatUserSummaryResponse {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  displayName: string;
}

export interface ChatConversationSummaryResponse {
  id: string;
  type: ChatConversationType;
  title: string;
  customerId?: string | null;
  customerName?: string | null;
  directUser?: ChatUserSummaryResponse | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  lastMessage?: ChatMessageResponse | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatAttachmentResponse {
  id: string;
  driveFileId: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  createdAt: string;
}

export interface ChatMessageResponse {
  id: string;
  conversationId: string;
  sender: ChatUserSummaryResponse;
  body?: string | null;
  attachments: ChatAttachmentResponse[];
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageListResponse {
  items: ChatMessageResponse[];
  pagination: {
    hasMore: boolean;
    nextBefore?: string | null;
  };
}

export interface ChatReadStateResponse {
  conversationId: string;
  userId: string;
  lastReadMessageId?: string | null;
  lastReadAt?: string | null;
  updatedAt: string;
}

export interface ChatReadStateSummaryResponse extends ChatReadStateResponse {
  user: ChatUserSummaryResponse;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly storage: DriveStorageService,
    private readonly realtime: ChatRealtimeService,
  ) {}

  async createTeamConversation(user?: AuthUser) {
    const authUser = this.requireUser(user);
    this.ensureInternalUser(authUser);

    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const uniqueWhere = {
      tenantId_type_systemKey: {
        tenantId,
        type: ChatConversationType.TEAM,
        systemKey: TEAM_CHAT_CONVERSATION_KEY,
      },
    } satisfies Prisma.ChatConversationWhereUniqueInput;

    let conversation: ChatConversationEntity | null = null;
    try {
      conversation = await this.prisma.chatConversation.upsert({
        where: uniqueWhere,
        create: {
          tenantId,
          type: ChatConversationType.TEAM,
          systemKey: TEAM_CHAT_CONVERSATION_KEY,
          title: TEAM_CHAT_TITLE,
          createdById: userId,
        },
        update: {
          title: TEAM_CHAT_TITLE,
        },
        include: chatConversationInclude,
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      conversation = await this.prisma.chatConversation.findUnique({
        where: uniqueWhere,
        include: chatConversationInclude,
      });
      if (!conversation) {
        throw error;
      }
    }

    return this.toConversationSummary(conversation, authUser);
  }

  async createDirectConversation(
    dto: CreateDirectConversationDto,
    user?: AuthUser,
  ) {
    const authUser = this.requireUser(user);
    this.ensureInternalUser(authUser);

    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();

    if (dto.userId === userId) {
      throw new BadRequestException(
        'Direktchat mit sich selbst ist nicht möglich.',
      );
    }

    const peer = await this.prisma.user.findFirst({
      where: {
        id: dto.userId,
        tenantId,
        role: {
          not: UserRole.CUSTOMER,
        },
      },
      select: { id: true },
    });

    if (!peer) {
      throw new NotFoundException('Mitarbeiter nicht gefunden.');
    }

    const systemKey = this.buildDirectConversationKey(userId, dto.userId);

    const conversation = await this.prisma.$transaction(async (tx) => {
      const uniqueWhere = {
        tenantId_type_systemKey: {
          tenantId,
          type: ChatConversationType.DIRECT,
          systemKey,
        },
      } satisfies Prisma.ChatConversationWhereUniqueInput;

      let upserted: { id: string };
      try {
        upserted = await tx.chatConversation.upsert({
          where: uniqueWhere,
          create: {
            tenantId,
            type: ChatConversationType.DIRECT,
            systemKey,
            createdById: userId,
          },
          update: {},
          select: {
            id: true,
          },
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }
        const existing = await tx.chatConversation.findUnique({
          where: uniqueWhere,
          select: {
            id: true,
          },
        });
        if (!existing) {
          throw error;
        }
        upserted = existing;
      }

      await tx.chatConversationMember.createMany({
        data: [
          { conversationId: upserted.id, userId },
          { conversationId: upserted.id, userId: dto.userId },
        ],
        skipDuplicates: true,
      });

      const full = await tx.chatConversation.findFirst({
        where: { id: upserted.id, tenantId },
        include: chatConversationInclude,
      });

      if (!full) {
        throw new NotFoundException('Direktchat konnte nicht geladen werden.');
      }
      return full;
    });
    const summary = await this.toConversationSummary(conversation, authUser);
    const participantUserIds = Array.from(
      new Set(conversation.members.map((member) => member.userId)),
    );
    this.realtime.emitConversationChanged({
      tenantId,
      conversationId: conversation.id,
      participantUserIds,
      reason: 'conversation_created',
      actorUserId: userId,
    });
    return summary;
  }

  async createCustomerConversation(
    dto: CreateCustomerConversationDto,
    user?: AuthUser,
  ) {
    const authUser = this.requireUser(user);
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();

    const customerId =
      authUser.role === UserRole.CUSTOMER
        ? (authUser.customerId ?? undefined)
        : dto.customerId;

    if (!customerId) {
      throw new BadRequestException('customerId ist erforderlich.');
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        tenantId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Kunde nicht gefunden.');
    }

    const systemKey = this.buildCustomerConversationKey(customer.id);
    const uniqueWhere = {
      tenantId_type_systemKey: {
        tenantId,
        type: ChatConversationType.CUSTOMER,
        systemKey,
      },
    } satisfies Prisma.ChatConversationWhereUniqueInput;

    let conversation: ChatConversationEntity | null = null;
    try {
      conversation = await this.prisma.chatConversation.upsert({
        where: uniqueWhere,
        create: {
          tenantId,
          type: ChatConversationType.CUSTOMER,
          systemKey,
          customerId: customer.id,
          title: customer.name,
          createdById: userId,
        },
        update: {
          customerId: customer.id,
          title: customer.name,
        },
        include: chatConversationInclude,
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      conversation = await this.prisma.chatConversation.findUnique({
        where: uniqueWhere,
        include: chatConversationInclude,
      });
      if (!conversation) {
        throw error;
      }
    }

    this.assertConversationAccess(conversation, authUser);
    const summary = await this.toConversationSummary(conversation, authUser);
    const participantUserIds =
      await this.resolveConversationParticipantUserIds(conversation);
    this.realtime.emitConversationChanged({
      tenantId,
      conversationId: conversation.id,
      participantUserIds,
      reason: 'conversation_created',
      actorUserId: userId,
    });
    return summary;
  }

  async listConversations(
    dto: ListChatConversationsDto,
    user?: AuthUser,
  ): Promise<ChatConversationSummaryResponse[]> {
    const authUser = this.requireUser(user);
    const tenantId = this.requireTenantId();
    const limit = Math.min(dto.limit ?? 40, 100);

    const where = this.buildConversationListWhere(tenantId, authUser);

    const conversations = await this.prisma.chatConversation.findMany({
      where,
      include: chatConversationInclude,
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });

    return Promise.all(
      conversations.map((conversation) =>
        this.toConversationSummary(conversation, authUser),
      ),
    );
  }

  async listMessages(
    conversationId: string,
    dto: ListChatMessagesDto,
    user?: AuthUser,
  ): Promise<ChatMessageListResponse> {
    const authUser = this.requireUser(user);
    const tenantId = this.requireTenantId();
    const limit = Math.min(dto.limit ?? 40, 100);

    const conversation = await this.getConversationOrThrow(
      conversationId,
      tenantId,
    );
    this.assertConversationAccess(conversation, authUser);

    const before = this.parseBeforeDate(dto.before);

    const rows = await this.prisma.chatMessage.findMany({
      where: {
        tenantId,
        conversationId: conversation.id,
        deletedAt: null,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      include: chatMessageInclude,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const oldest = sliced[sliced.length - 1] ?? null;

    return {
      items: sliced.reverse().map((item) => this.toMessageResponse(item)),
      pagination: {
        hasMore,
        nextBefore: hasMore && oldest ? oldest.createdAt.toISOString() : null,
      },
    };
  }

  async listReadStates(
    conversationId: string,
    user?: AuthUser,
  ): Promise<ChatReadStateSummaryResponse[]> {
    const authUser = this.requireUser(user);
    const tenantId = this.requireTenantId();

    const conversation = await this.getConversationOrThrow(
      conversationId,
      tenantId,
    );
    this.assertConversationAccess(conversation, authUser);

    const states = await this.prisma.chatReadState.findMany({
      where: {
        tenantId,
        conversationId,
      },
      include: {
        user: {
          select: chatUserSelect,
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return states.map((state) => ({
      conversationId: state.conversationId,
      userId: state.userId,
      lastReadMessageId: state.lastReadMessageId,
      lastReadAt: state.lastReadAt?.toISOString() ?? null,
      updatedAt: state.updatedAt.toISOString(),
      user: this.toUserSummary(state.user)!,
    }));
  }

  async ensureConversationAccess(conversationId: string, user: AuthUser) {
    const conversation = await this.getConversationOrThrow(
      conversationId,
      user.tenantId,
    );
    this.assertConversationAccess(conversation, user);
    return conversation;
  }

  async resolveParticipantUserIds(
    conversationId: string,
    user?: AuthUser,
  ): Promise<string[]> {
    const authUser = this.requireUser(user);
    const tenantId = this.requireTenantId();
    const conversation = await this.getConversationOrThrow(
      conversationId,
      tenantId,
    );
    this.assertConversationAccess(conversation, authUser);
    return this.resolveConversationParticipantUserIds(conversation);
  }

  async sendMessage(
    conversationId: string,
    dto: CreateChatMessageDto,
    user?: AuthUser,
  ): Promise<ChatMessageResponse> {
    const authUser = this.requireUser(user);
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();

    const conversation = await this.getConversationOrThrow(
      conversationId,
      tenantId,
    );
    this.assertConversationAccess(conversation, authUser);

    const body = dto.body?.trim() || null;
    const attachmentFileIds = Array.from(
      new Set((dto.attachmentFileIds ?? []).filter(Boolean)),
    );

    if (!body && attachmentFileIds.length === 0) {
      throw new BadRequestException(
        'Eine Nachricht benötigt Text oder Anhang.',
      );
    }

    const attachmentFiles = attachmentFileIds.length
      ? await this.resolveAttachmentFiles(attachmentFileIds, tenantId, userId)
      : [];

    const created = await this.prisma.$transaction(async (tx) => {
      if (conversation.type === ChatConversationType.DIRECT) {
        await tx.chatConversationMember.createMany({
          data: [{ conversationId: conversation.id, userId }],
          skipDuplicates: true,
        });
      }

      const message = await tx.chatMessage.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          senderId: userId,
          body,
          attachments: attachmentFiles.length
            ? {
                create: attachmentFiles.map((file) => ({
                  driveFileId: file.id,
                  name: file.name,
                  mimeType: file.mimeType,
                  size: file.size,
                })),
              }
            : undefined,
        },
        include: chatMessageInclude,
      });

      await tx.chatConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: message.createdAt,
        },
      });

      await tx.chatReadState.upsert({
        where: {
          conversationId_userId: {
            conversationId: conversation.id,
            userId,
          },
        },
        create: {
          tenantId,
          conversationId: conversation.id,
          userId,
          lastReadMessageId: message.id,
          lastReadAt: message.createdAt,
        },
        update: {
          lastReadMessageId: message.id,
          lastReadAt: message.createdAt,
        },
      });

      return message;
    });
    const response = this.toMessageResponse(created);
    const participantUserIds =
      await this.resolveConversationParticipantUserIds(conversation);
    this.realtime.emitMessageCreated({
      tenantId,
      conversationId: conversation.id,
      participantUserIds,
      message: response,
    });
    this.realtime.emitConversationChanged({
      tenantId,
      conversationId: conversation.id,
      participantUserIds,
      reason: 'message_created',
      actorUserId: userId,
    });
    return response;
  }

  async uploadAttachment(
    conversationId: string,
    file: Express.Multer.File,
    dto: UploadChatAttachmentDto,
    user?: AuthUser,
  ) {
    const authUser = this.requireUser(user);
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();

    if (!file?.buffer?.length) {
      throw new BadRequestException('Datei fehlt oder ist leer.');
    }

    const conversation = await this.getConversationOrThrow(
      conversationId,
      tenantId,
    );
    this.assertConversationAccess(conversation, authUser);

    const folder = await this.prisma.$transaction((tx) =>
      this.ensureChatImagesFolderInTx(tx, tenantId),
    );

    const storageKey = await this.storage.saveFile({
      tenantId,
      buffer: file.buffer,
      originalName: file.originalname,
    });

    const uploaded = await this.prisma.driveFile.create({
      data: {
        tenantId,
        ownerUserId: null,
        uploadedById: userId,
        scope: DriveScope.TEAM,
        folderId: folder.id,
        name: this.sanitizeFileName(dto.name ?? file.originalname),
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
        storageKey,
      },
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });

    return {
      fileId: uploaded.id,
      name: uploaded.name,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      createdAt: uploaded.createdAt.toISOString(),
    };
  }

  async markRead(
    conversationId: string,
    dto: MarkChatReadDto,
    user?: AuthUser,
  ): Promise<ChatReadStateResponse> {
    const authUser = this.requireUser(user);
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();

    const conversation = await this.getConversationOrThrow(
      conversationId,
      tenantId,
    );
    this.assertConversationAccess(conversation, authUser);

    let lastReadMessageId: string | null = null;
    let lastReadAt: Date | null = null;

    if (dto.lastReadMessageId) {
      const message = await this.prisma.chatMessage.findFirst({
        where: {
          id: dto.lastReadMessageId,
          tenantId,
          conversationId: conversation.id,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });
      if (!message) {
        throw new BadRequestException(
          'lastReadMessageId gehört nicht zu dieser Konversation.',
        );
      }
      lastReadMessageId = message.id;
      lastReadAt = message.createdAt;
    } else {
      const latest = await this.prisma.chatMessage.findFirst({
        where: {
          tenantId,
          conversationId: conversation.id,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          createdAt: true,
        },
      });
      if (latest) {
        lastReadMessageId = latest.id;
        lastReadAt = latest.createdAt;
      } else {
        lastReadAt = new Date();
      }
    }

    const state = await this.prisma.chatReadState.upsert({
      where: {
        conversationId_userId: {
          conversationId: conversation.id,
          userId,
        },
      },
      create: {
        tenantId,
        conversationId: conversation.id,
        userId,
        lastReadMessageId,
        lastReadAt,
      },
      update: {
        lastReadMessageId,
        lastReadAt,
      },
      select: {
        conversationId: true,
        userId: true,
        lastReadMessageId: true,
        lastReadAt: true,
        updatedAt: true,
      },
    });

    const response: ChatReadStateResponse = {
      conversationId: state.conversationId,
      userId: state.userId,
      lastReadMessageId: state.lastReadMessageId,
      lastReadAt: state.lastReadAt?.toISOString() ?? null,
      updatedAt: state.updatedAt.toISOString(),
    };
    const participantUserIds =
      await this.resolveConversationParticipantUserIds(conversation);
    this.realtime.emitReadUpdated({
      tenantId,
      conversationId: conversation.id,
      participantUserIds,
      state: response,
    });
    this.realtime.emitConversationChanged({
      tenantId,
      conversationId: conversation.id,
      participantUserIds,
      reason: 'read_updated',
      actorUserId: userId,
    });
    return response;
  }

  async downloadAttachment(attachmentId: string, user?: AuthUser) {
    const authUser = this.requireUser(user);
    const tenantId = this.requireTenantId();

    const attachment = await this.prisma.chatMessageAttachment.findFirst({
      where: {
        id: attachmentId,
        message: {
          tenantId,
        },
      },
      include: {
        message: {
          include: {
            conversation: {
              include: {
                members: {
                  select: {
                    userId: true,
                  },
                },
              },
            },
          },
        },
        driveFile: true,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Chat-Anhang nicht gefunden.');
    }

    this.assertConversationAccessByPayload(
      {
        type: attachment.message.conversation.type,
        customerId: attachment.message.conversation.customerId,
        members: attachment.message.conversation.members,
      },
      authUser,
    );

    const opened = await this.storage.openFile(attachment.driveFile.storageKey);

    return {
      stream: opened.stream,
      size: opened.size,
      fileName: attachment.name,
      mimeType:
        attachment.mimeType ||
        attachment.driveFile.mimeType ||
        'application/octet-stream',
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async purgeOldChatAttachments() {
    const cutoff = new Date(
      Date.now() - CHAT_ATTACHMENT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    );
    const staleFiles = await this.prisma.driveFile.findMany({
      where: {
        scope: DriveScope.TEAM,
        isDeleted: false,
        createdAt: { lt: cutoff },
        folder: {
          is: {
            systemKey: TEAM_CHAT_IMAGES_SYSTEM_KEY,
          },
        },
      },
      select: {
        id: true,
        storageKey: true,
      },
      take: 2000,
    });

    if (!staleFiles.length) {
      return;
    }

    const ids = staleFiles.map((file) => file.id);

    await this.prisma.$transaction([
      this.prisma.chatMessageAttachment.deleteMany({
        where: {
          driveFileId: {
            in: ids,
          },
        },
      }),
      this.prisma.driveFile.deleteMany({
        where: {
          id: {
            in: ids,
          },
        },
      }),
    ]);

    for (const file of staleFiles) {
      try {
        await this.storage.deleteFile(file.storageKey);
      } catch (error) {
        this.logger.warn(
          `Konnte Chat-Anhang im Storage nicht löschen (${file.id}): ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    this.logger.log(
      `Chat-Retention: ${staleFiles.length} Anhang-Dateien älter als ${CHAT_ATTACHMENT_MAX_AGE_DAYS} Tage gelöscht.`,
    );
  }

  private async resolveAttachmentFiles(
    attachmentFileIds: string[],
    tenantId: string,
    userId: string,
  ) {
    const files = await this.prisma.driveFile.findMany({
      where: {
        id: {
          in: attachmentFileIds,
        },
        tenantId,
        scope: DriveScope.TEAM,
        isDeleted: false,
        uploadedById: userId,
        folder: {
          is: {
            systemKey: TEAM_CHAT_IMAGES_SYSTEM_KEY,
          },
        },
      },
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
      },
    });

    if (files.length !== attachmentFileIds.length) {
      throw new BadRequestException(
        'Mindestens ein Anhang ist ungültig oder nicht verfügbar.',
      );
    }

    const byId = new Map(files.map((file) => [file.id, file]));
    return attachmentFileIds.map((id) => {
      const file = byId.get(id);
      if (!file) {
        throw new BadRequestException(
          'Mindestens ein Anhang ist ungültig oder nicht verfügbar.',
        );
      }
      return file;
    });
  }

  private async resolveConversationParticipantUserIds(
    conversation: ChatConversationEntity,
  ) {
    if (conversation.type === ChatConversationType.DIRECT) {
      return Array.from(
        new Set(conversation.members.map((member) => member.userId)),
      );
    }

    const internalUsers = await this.prisma.user.findMany({
      where: {
        tenantId: conversation.tenantId,
        role: {
          not: UserRole.CUSTOMER,
        },
      },
      select: {
        id: true,
      },
    });

    if (conversation.type === ChatConversationType.TEAM) {
      return internalUsers.map((user) => user.id);
    }

    if (!conversation.customerId) {
      return internalUsers.map((user) => user.id);
    }

    const customerUsers = await this.prisma.user.findMany({
      where: {
        tenantId: conversation.tenantId,
        role: UserRole.CUSTOMER,
        customerId: conversation.customerId,
      },
      select: {
        id: true,
      },
    });

    return Array.from(
      new Set([
        ...internalUsers.map((user) => user.id),
        ...customerUsers.map((user) => user.id),
      ]),
    );
  }

  private buildConversationListWhere(
    tenantId: string,
    user: AuthUser,
  ): Prisma.ChatConversationWhereInput {
    if (user.role === UserRole.CUSTOMER) {
      const customerId = user.customerId ?? '__missing__';
      return {
        tenantId,
        type: ChatConversationType.CUSTOMER,
        customerId,
      };
    }

    return {
      tenantId,
      OR: [
        {
          type: ChatConversationType.TEAM,
        },
        {
          type: ChatConversationType.CUSTOMER,
        },
        {
          type: ChatConversationType.DIRECT,
          members: {
            some: {
              userId: user.sub,
            },
          },
        },
      ],
    };
  }

  private parseBeforeDate(value?: string) {
    if (!value?.trim()) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('before muss ein gültiges ISO-Datum sein.');
    }
    return parsed;
  }

  private buildDirectConversationKey(a: string, b: string) {
    const [first, second] = [a, b].sort();
    return `direct:${first}:${second}`;
  }

  private buildCustomerConversationKey(customerId: string) {
    return `customer:${customerId}`;
  }

  private async getConversationOrThrow(
    conversationId: string,
    tenantId: string,
  ) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        tenantId,
      },
      include: chatConversationInclude,
    });

    if (!conversation) {
      throw new NotFoundException('Chat-Konversation nicht gefunden.');
    }

    return conversation;
  }

  private async toConversationSummary(
    conversation: ChatConversationEntity,
    user: AuthUser,
  ): Promise<ChatConversationSummaryResponse> {
    const userId = user.sub;

    const [lastMessage, readState] = await Promise.all([
      this.prisma.chatMessage.findFirst({
        where: {
          conversationId: conversation.id,
          tenantId: conversation.tenantId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: chatMessageInclude,
      }),
      this.prisma.chatReadState.findUnique({
        where: {
          conversationId_userId: {
            conversationId: conversation.id,
            userId,
          },
        },
      }),
    ]);

    const unreadCount = await this.prisma.chatMessage.count({
      where: {
        conversationId: conversation.id,
        tenantId: conversation.tenantId,
        deletedAt: null,
        senderId: {
          not: userId,
        },
        ...(readState?.lastReadAt
          ? {
              createdAt: {
                gt: readState.lastReadAt,
              },
            }
          : {}),
      },
    });

    const directUser =
      conversation.type === ChatConversationType.DIRECT
        ? this.toUserSummary(
            conversation.members.find((member) => member.userId !== userId)
              ?.user ?? null,
          )
        : null;

    const title =
      conversation.type === ChatConversationType.TEAM
        ? TEAM_CHAT_TITLE
        : conversation.type === ChatConversationType.DIRECT
          ? directUser?.displayName || 'Direktchat'
          : conversation.customer?.name || 'Kundenchat';

    return {
      id: conversation.id,
      type: conversation.type,
      title,
      customerId: conversation.customerId,
      customerName: conversation.customer?.name ?? null,
      directUser,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      unreadCount,
      lastMessage: lastMessage ? this.toMessageResponse(lastMessage) : null,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  private toMessageResponse(entity: ChatMessageEntity): ChatMessageResponse {
    return {
      id: entity.id,
      conversationId: entity.conversationId,
      sender: this.toUserSummary(entity.sender)!,
      body: entity.body,
      attachments: entity.attachments.map((attachment) => ({
        id: attachment.id,
        driveFileId: attachment.driveFileId,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: attachment.createdAt.toISOString(),
      })),
      deletedAt: entity.deletedAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private toUserSummary(
    user: ChatUserEntity | null,
  ): ChatUserSummaryResponse | null {
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      displayName: this.getUserDisplayName(user),
    };
  }

  private getUserDisplayName(
    user: Pick<ChatUserEntity, 'firstName' | 'lastName' | 'email'>,
  ) {
    const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return name || user.email;
  }

  private assertConversationAccess(
    conversation: ChatConversationEntity,
    user: AuthUser,
  ) {
    this.assertConversationAccessByPayload(
      {
        type: conversation.type,
        customerId: conversation.customerId,
        members: conversation.members,
      },
      user,
    );
  }

  private assertConversationAccessByPayload(
    payload: {
      type: ChatConversationType;
      customerId?: string | null;
      members: Array<{ userId: string }>;
    },
    user: AuthUser,
  ) {
    if (user.role === UserRole.CUSTOMER) {
      if (
        payload.type !== ChatConversationType.CUSTOMER ||
        !payload.customerId ||
        payload.customerId !== user.customerId
      ) {
        throw new ForbiddenException('Kein Zugriff auf diese Konversation.');
      }
      return;
    }

    if (payload.type === ChatConversationType.DIRECT) {
      const isMember = payload.members.some(
        (member) => member.userId === user.sub,
      );
      if (!isMember) {
        throw new ForbiddenException('Kein Zugriff auf diesen Direktchat.');
      }
    }
  }

  private requireTenantId() {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant-Kontext fehlt.');
    }
    return tenantId;
  }

  private requireUserId() {
    const userId = this.context.getUserId();
    if (!userId) {
      throw new ForbiddenException('Benutzerkontext fehlt.');
    }
    return userId;
  }

  private requireUser(user?: AuthUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Benutzerkontext fehlt.');
    }
    return user;
  }

  private ensureInternalUser(user: AuthUser) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenException(
        'Nur interne Mitarbeiter können diese Aktion ausführen.',
      );
    }
  }

  private sanitizeFileName(value?: string | null) {
    if (!value) {
      return 'Anhang';
    }
    const cleaned = value.replace(/[\\/]/g, ' ').trim();
    if (!cleaned) {
      return 'Anhang';
    }
    return cleaned.slice(0, 255);
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private async ensureChatImagesFolderInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ) {
    const existing = await tx.driveFolder.findFirst({
      where: {
        tenantId,
        scope: DriveScope.TEAM,
        kind: DriveFolderKind.GENERAL,
        systemKey: TEAM_CHAT_IMAGES_SYSTEM_KEY,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (existing) {
      if (
        existing.parentId === null &&
        existing.ownerUserId === null &&
        existing.customerId === null &&
        existing.scope === DriveScope.TEAM &&
        existing.kind === DriveFolderKind.GENERAL &&
        existing.systemKey === TEAM_CHAT_IMAGES_SYSTEM_KEY &&
        existing.name === TEAM_CHAT_IMAGES_FOLDER_NAME
      ) {
        return existing;
      }
      return tx.driveFolder.update({
        where: {
          id: existing.id,
        },
        data: {
          parentId: null,
          ownerUserId: null,
          customerId: null,
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.GENERAL,
          systemKey: TEAM_CHAT_IMAGES_SYSTEM_KEY,
          name: TEAM_CHAT_IMAGES_FOLDER_NAME,
        },
      });
    }

    try {
      return await tx.driveFolder.create({
        data: {
          tenantId,
          ownerUserId: null,
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.GENERAL,
          parentId: null,
          customerId: null,
          systemKey: TEAM_CHAT_IMAGES_SYSTEM_KEY,
          name: TEAM_CHAT_IMAGES_FOLDER_NAME,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      const conflict = await tx.driveFolder.findFirst({
        where: {
          tenantId,
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.GENERAL,
          systemKey: TEAM_CHAT_IMAGES_SYSTEM_KEY,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
      if (conflict) {
        return conflict;
      }
      throw error;
    }
  }
}
