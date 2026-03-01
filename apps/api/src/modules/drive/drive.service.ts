import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DriveScope, Prisma, UserRole } from '@prisma/client';
import type { Express } from 'express';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RequestContextService } from '@/infra/request-context/request-context.service';
import type { AuthUser } from '@/modules/auth/auth.types';

import { DriveStorageService } from './drive-storage.service';
import { ListDriveFilesDto } from './dto/list-drive-files.dto';
import { UpdateDriveFileDto } from './dto/update-drive-file.dto';
import { UploadDriveFileDto } from './dto/upload-drive-file.dto';
import type {
  DriveFileListResponse,
  DriveFileResponse,
  DriveTeamSummary,
  DriveUserSummary,
} from './drive.types';
import { CreateDriveFolderDto, UpdateDriveFolderDto } from './dto/folder.dto';

type DriveFileWithRelations = Prisma.DriveFileGetPayload<{
  include: {
    uploadedBy: true;
    ownerUser: true;
    tenant: { select: { id: true; name: true } };
  };
}>;

@Injectable()
export class DriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly storage: DriveStorageService,
  ) {}

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

  private sanitizeFileName(value?: string | null) {
    if (!value) {
      return 'Unbenannte Datei';
    }
    const cleaned = value.replace(/[\\/]/g, ' ').trim();
    if (!cleaned) {
      return 'Unbenannte Datei';
    }
    return cleaned.slice(0, 255);
  }

  private getUserSummary(
    user?: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      avatarUrl?: string | null;
    } | null,
  ): DriveUserSummary | null {
    if (!user) {
      return null;
    }
    const hasName = user.firstName || user.lastName;
    const displayName = hasName
      ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
      : (user.email ?? '');
    return {
      id: user.id,
      displayName: displayName || user.id,
      email: user.email,
      avatarUrl: user.avatarUrl,
    };
  }

  private toResponse(file: DriveFileWithRelations): DriveFileResponse {
    return {
      id: file.id,
      scope: file.scope,
      folderId: file.folderId,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
      ownerUserId: file.ownerUserId,
      uploadedBy: this.getUserSummary(file.uploadedBy)!,
      ownerUser: this.getUserSummary(file.ownerUser),
      team:
        file.scope === DriveScope.TEAM
          ? {
              id: file.tenant.id,
              name: file.tenant.name ?? 'Team',
            }
          : null,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    };
  }

  async listTeams(user?: AuthUser): Promise<DriveTeamSummary[]> {
    const tenantId = this.requireTenantId();
    if (!user?.sub) {
      throw new ForbiddenException('Benutzerkontext fehlt.');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    return [
      {
        id: tenantId,
        name: tenant?.name ?? 'Workspace',
        isDefault: true,
      },
    ];
  }

  async listFiles(
    dto: ListDriveFilesDto,
    user?: AuthUser,
  ): Promise<DriveFileListResponse> {
    const tenantId = this.requireTenantId();
    const scope = dto.scope ?? DriveScope.USER;
    const limit = Math.min(dto.limit ?? 25, 100);
    const page = dto.page && dto.page > 0 ? dto.page : 1;
    const skip = (page - 1) * limit;
    const where: Prisma.DriveFileWhereInput = {
      tenantId,
      scope,
      isDeleted: false,
    };

    if (scope === DriveScope.USER) {
      where.ownerUserId = this.requireUserId();
    } else {
      await this.ensureTeamAccess(dto.teamId, user);
    }

    if (dto.folderId) {
      await this.ensureFolderAccess(dto.folderId, scope, dto.teamId, user);
      where.folderId = dto.folderId;
    }

    const search = dto.search?.trim();
    if (search) {
      const userMatch: Prisma.UserWhereInput = {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
        ],
      };

      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { name: { contains: search } },
            { mimeType: { contains: search } },
            { uploadedBy: { is: userMatch } },
            { ownerUser: { is: userMatch } },
          ],
        },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.driveFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          uploadedBy: true,
          ownerUser: true,
          tenant: { select: { id: true, name: true } },
        },
      }),
      this.prisma.driveFile.count({ where }),
    ]);

    const paginationTotal = Math.max(1, Math.ceil(total / limit));

    return {
      items: items.map((item) => this.toResponse(item)),
      pagination: {
        page,
        limit,
        totalItems: total,
        totalPages: paginationTotal,
      },
    };
  }

  async listFolders(dto: ListDriveFilesDto, user?: AuthUser) {
    const tenantId = this.requireTenantId();
    const scope = dto.scope ?? DriveScope.USER;
    if (scope === DriveScope.USER) {
      this.requireUserId();
    } else {
      await this.ensureTeamAccess(dto.teamId, user);
    }
    const folders = await this.prisma.driveFolder.findMany({
      where: {
        tenantId,
        scope,
        ownerUserId: scope === DriveScope.USER ? this.requireUserId() : undefined,
      },
      orderBy: { name: 'asc' },
    });
    return folders;
  }

  async createFolder(dto: CreateDriveFolderDto, user?: AuthUser) {
    const tenantId = this.requireTenantId();
    const scope = dto.scope ?? DriveScope.USER;
    if (scope === DriveScope.USER) {
      const ownerId = this.requireUserId();
      const folder = await this.prisma.driveFolder.create({
        data: {
          tenantId,
          scope,
          ownerUserId: ownerId,
          name: this.sanitizeFileName(dto.name),
        },
      });
      return folder;
    }
    await this.ensureTeamAccess(dto.teamId, user);
    const folder = await this.prisma.driveFolder.create({
      data: {
        tenantId,
        scope,
        name: this.sanitizeFileName(dto.name),
      },
    });
    return folder;
  }

  async updateFolder(id: string, dto: UpdateDriveFolderDto, user?: AuthUser) {
    const tenantId = this.requireTenantId();
    const folder = await this.prisma.driveFolder.findFirst({
      where: { id, tenantId },
    });
    if (!folder) {
      throw new NotFoundException('Ordner nicht gefunden.');
    }
    if (folder.scope === DriveScope.USER) {
      if (folder.ownerUserId !== this.requireUserId()) {
        throw new ForbiddenException('Kein Zugriff auf diesen Ordner.');
      }
    } else {
      await this.ensureTeamAccess(undefined, user);
    }
    const updated = await this.prisma.driveFolder.update({
      where: { id },
      data: { name: dto.name ? this.sanitizeFileName(dto.name) : folder.name },
    });
    return updated;
  }

  async deleteFolder(id: string, user?: AuthUser) {
    const tenantId = this.requireTenantId();
    const folder = await this.prisma.driveFolder.findFirst({
      where: { id, tenantId },
    });
    if (!folder) {
      throw new NotFoundException('Ordner nicht gefunden.');
    }
    if (folder.scope === DriveScope.USER) {
      if (folder.ownerUserId !== this.requireUserId()) {
        throw new ForbiddenException('Kein Zugriff auf diesen Ordner.');
      }
    } else {
      await this.ensureTeamAccess(undefined, user);
    }

    await this.prisma.driveFile.updateMany({
      where: { folderId: id },
      data: { folderId: null },
    });

    await this.prisma.driveFolder.delete({ where: { id } });
    return { success: true };
  }

  async uploadFile(
    dto: UploadDriveFileDto,
    file: Express.Multer.File,
    user?: AuthUser,
  ): Promise<DriveFileResponse> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Upload-Datei fehlt oder ist leer.');
    }
    const tenantId = this.requireTenantId();
    const uploaderId = this.requireUserId();
    const scope = dto.scope ?? DriveScope.USER;
    if (scope === DriveScope.TEAM) {
      await this.ensureTeamAccess(dto.teamId, user);
    }
    if (dto.folderId) {
      await this.ensureFolderAccess(dto.folderId, scope, dto.teamId, user);
    }

    const storageKey = await this.storage.saveFile({
      tenantId,
      buffer: file.buffer,
      originalName: file.originalname,
    });

    const entity = await this.prisma.driveFile.create({
      data: {
        tenantId,
        ownerUserId: scope === DriveScope.USER ? uploaderId : null,
        uploadedById: uploaderId,
        scope,
        folderId: dto.folderId,
        name: this.sanitizeFileName(dto.name ?? file.originalname),
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
        storageKey,
      },
      include: {
        uploadedBy: true,
        ownerUser: true,
        tenant: { select: { id: true, name: true } },
        folder: true,
      },
    });

    return this.toResponse(entity);
  }

  async renameFile(id: string, dto: UpdateDriveFileDto, user?: AuthUser) {
    const file = await this.getFileOrThrow(id);
    this.ensureCanMutate(file, user);

    if (dto.folderId !== undefined && dto.folderId !== null) {
      await this.ensureFolderAccess(dto.folderId, file.scope, undefined, user);
    }
    if (dto.folderId === null && file.scope === DriveScope.TEAM) {
      await this.ensureTeamAccess(undefined, user);
    }

    const updated = await this.prisma.driveFile.update({
      where: { id: file.id },
      data: {
        name: dto.name ? this.sanitizeFileName(dto.name) : file.name,
        folderId: dto.folderId !== undefined ? dto.folderId : file.folderId,
      },
      include: {
        uploadedBy: true,
        ownerUser: true,
        tenant: { select: { id: true, name: true } },
        folder: true,
      },
    });

    return this.toResponse(updated);
  }

  async deleteFile(id: string, user?: AuthUser) {
    const file = await this.getFileOrThrow(id);
    this.ensureCanMutate(file, user);

    await this.prisma.driveFile.update({
      where: { id: file.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    await this.storage.deleteFile(file.storageKey);
    return { success: true };
  }

  async getDownloadStream(id: string, user?: AuthUser) {
    const file = await this.getFileOrThrow(id);
    this.ensureCanRead(file, user);
    const opened = await this.storage.openFile(file.storageKey);
    return {
      stream: opened.stream,
      size: opened.size,
      fileName: file.name,
      mimeType: file.mimeType || 'application/octet-stream',
    };
  }

  async getPublicFileStream(
    id: string,
    options?: { allowedFolderNames?: string[]; scope?: DriveScope },
  ) {
    const file = await this.prisma.driveFile.findFirst({
      where: { id, isDeleted: false },
      include: { folder: true },
    });
    if (!file) {
      throw new NotFoundException('Datei nicht gefunden.');
    }
    if (file.scope !== DriveScope.TEAM) {
      throw new ForbiddenException('Nur Team-Dateien sind öffentlich abrufbar.');
    }
    if (options?.scope && file.scope !== options.scope) {
      throw new ForbiddenException('Keine Berechtigung für diese Datei.');
    }
    if (options?.allowedFolderNames?.length) {
      const name = file.folder?.name?.toLowerCase() ?? '';
      const allowed = options.allowedFolderNames.some(
        (item) => item.toLowerCase() === name,
      );
      if (!allowed) {
        throw new ForbiddenException('Keine Berechtigung für diese Datei.');
      }
    }
    const opened = await this.storage.openFile(file.storageKey);
    return {
      stream: opened.stream,
      size: opened.size,
      fileName: file.name,
      mimeType: file.mimeType || 'application/octet-stream',
    };
  }

  private ensureCanRead(file: DriveFileWithRelations, user?: AuthUser) {
    const tenantId = this.requireTenantId();
    if (file.tenantId !== tenantId || file.isDeleted) {
      throw new NotFoundException('Datei nicht gefunden.');
    }
    if (file.scope === DriveScope.USER) {
      if (!user?.sub || file.ownerUserId !== user.sub) {
        throw new ForbiddenException('Keine Berechtigung für diese Datei.');
      }
      return;
    }
    if (file.scope === DriveScope.TEAM) {
      if (!user?.tenantId || user.tenantId !== tenantId) {
        throw new ForbiddenException('Team-Zugriff verweigert.');
      }
    }
  }

  private ensureCanMutate(file: DriveFileWithRelations, user?: AuthUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Benutzerkontext fehlt.');
    }
    if (file.scope === DriveScope.USER) {
      if (file.ownerUserId !== user.sub) {
        throw new ForbiddenException(
          'Nur Eigentümer dürfen diese Datei ändern.',
        );
      }
      return;
    }
    if (
      file.scope === DriveScope.TEAM &&
      file.uploadedById !== user.sub &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException(
        'Nur Uploader oder Admins dürfen diese Datei ändern.',
      );
    }
  }

  private async ensureTeamAccess(teamId?: string, user?: AuthUser) {
    const tenantId = this.requireTenantId();
    const resolved = teamId ?? tenantId;
    if (resolved !== tenantId) {
      throw new ForbiddenException('Team gehört nicht zu diesem Workspace.');
    }
    if (!user?.sub) {
      throw new ForbiddenException('Benutzerkontext fehlt.');
    }
  }

  private async ensureFolderAccess(folderId: string, scope: DriveScope, teamId?: string, user?: AuthUser) {
    const tenantId = this.requireTenantId();
    const folder = await this.prisma.driveFolder.findFirst({
      where: { id: folderId, tenantId },
    });
    if (!folder) {
      throw new NotFoundException('Ordner nicht gefunden.');
    }
    if (folder.scope !== scope) {
      throw new ForbiddenException('Ordner-Scope passt nicht zur Datei.');
    }
    if (scope === DriveScope.USER) {
      if (folder.ownerUserId !== this.requireUserId()) {
        throw new ForbiddenException('Ordner gehört einem anderen Benutzer.');
      }
    } else {
      await this.ensureTeamAccess(teamId, user);
    }
    return folder;
  }

  private async getFileOrThrow(id: string) {
    const tenantId = this.requireTenantId();
    const file = await this.prisma.driveFile.findFirst({
      where: { id, tenantId, isDeleted: false },
      include: {
        uploadedBy: true,
        ownerUser: true,
        tenant: { select: { id: true, name: true } },
      },
    });
    if (!file) {
      throw new NotFoundException('Datei nicht gefunden.');
    }
    return file;
  }
}
