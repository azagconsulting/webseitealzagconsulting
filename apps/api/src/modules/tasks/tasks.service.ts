import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskBoard, TaskPriority, TaskStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import type { AuthUser } from '../auth/auth.types';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  private getTenantOrThrow() {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant-Kontext fehlt.');
    }
    return tenantId;
  }

  private async ensureAssignee(assigneeId: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: assigneeId, tenantId },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('Assignee gehört nicht zum Tenant.');
    }
  }

  async list(board: TaskBoard, user?: AuthUser) {
    const tenantId = this.getTenantOrThrow();
    const where: Prisma.TaskWhereInput = {
      tenantId,
      board,
    };

    if (board === TaskBoard.MY) {
      if (!user?.sub) {
        throw new ForbiddenException('Kein Benutzer für persönliches Board.');
      }
      where.creatorId = user.sub;
    }

    return this.prisma.task.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: { assignee: true, creator: true },
    });
  }

  async create(dto: CreateTaskDto, user?: AuthUser) {
    const tenantId = this.getTenantOrThrow();
    const board = dto.board ?? TaskBoard.TEAM;
    const creatorId = user?.sub ?? null;

    if (board === TaskBoard.MY && !creatorId) {
      throw new ForbiddenException(
        'Persönliche Aufgaben erfordern einen Benutzer.',
      );
    }

    if (dto.assigneeId) {
      await this.ensureAssignee(dto.assigneeId, tenantId);
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;

    const task = await this.prisma.task.create({
      data: {
        tenantId,
        title: dto.title,
        description: dto.description,
        status: dto.status ?? TaskStatus.BACKLOG,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        board,
        assigneeId: dto.assigneeId,
        creatorId,
        dueDate,
      },
      include: { assignee: true, creator: true },
    });

    return task;
  }

  async update(id: string, dto: UpdateTaskDto, user?: AuthUser) {
    const tenantId = this.getTenantOrThrow();
    const task = await this.prisma.task.findFirst({
      where: { id, tenantId },
      include: { assignee: true, creator: true },
    });
    if (!task) {
      throw new NotFoundException('Task nicht gefunden.');
    }
    if (
      task.board === TaskBoard.MY &&
      task.creatorId &&
      task.creatorId !== user?.sub
    ) {
      throw new ForbiddenException('Keine Berechtigung für dieses Board.');
    }

    if (dto.assigneeId) {
      await this.ensureAssignee(dto.assigneeId, tenantId);
    }

    const data: Prisma.TaskUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority) data.priority = dto.priority;
    if (dto.status) data.status = dto.status;
    if (dto.board) {
      if (dto.board === TaskBoard.MY && !user?.sub) {
        throw new ForbiddenException(
          'Persönliche Aufgaben erfordern einen Benutzer.',
        );
      }
      data.board = dto.board;
      if (dto.board === TaskBoard.MY) {
        const creatorId = user?.sub ?? task.creatorId;
        if (!creatorId) {
          throw new ForbiddenException('Kein Besitzer für persönliches Board.');
        }
        data.creator = { connect: { id: creatorId } };
      }
    }
    if (dto.assigneeId !== undefined) {
      data.assignee = dto.assigneeId
        ? { connect: { id: dto.assigneeId } }
        : { disconnect: true };
    }
    if (dto.dueDate !== undefined) {
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }

    return this.prisma.task.update({
      where: { id },
      data,
      include: { assignee: true, creator: true },
    });
  }

  async delete(id: string, user?: AuthUser) {
    const tenantId = this.getTenantOrThrow();
    const task = await this.prisma.task.findFirst({
      where: { id, tenantId },
      select: { id: true, board: true, creatorId: true },
    });
    if (!task) {
      throw new NotFoundException('Task nicht gefunden.');
    }
    if (
      task.board === TaskBoard.MY &&
      task.creatorId &&
      task.creatorId !== user?.sub
    ) {
      throw new ForbiddenException('Keine Berechtigung für dieses Board.');
    }
    await this.prisma.task.delete({ where: { id } });
    return { success: true };
  }
}
