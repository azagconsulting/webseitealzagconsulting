import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DriveFolderKind, DriveScope, Prisma, UserRole } from '@prisma/client';
import type { Express } from 'express';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RequestContextService } from '@/infra/request-context/request-context.service';
import type { AuthUser } from '@/modules/auth/auth.types';

import { DriveStorageService } from './drive-storage.service';
import { UploadCustomerDriveFileDto } from './dto/upload-customer-drive-file.dto';
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

const TEAM_CUSTOMERS_ROOT_SYSTEM_KEY = 'team_customers_root';
const TEAM_CUSTOMERS_ROOT_NAME = 'Kunden';
const TEAM_PROFILE_LOGOS_SYSTEM_KEY = 'team_profile_logos_internal';
const TEAM_PROFILE_LOGOS_FOLDER_NAME = 'Mitarbeiter-Logos (intern)';
const TEAM_CHAT_IMAGES_SYSTEM_KEY = 'team_chat_images_internal';
const INTERNAL_PROFILE_LOGO_NAME_PREFIX = 'mitarbeiterlogo';
const INTERNAL_TEAM_FOLDER_SYSTEM_KEYS = [
  TEAM_PROFILE_LOGOS_SYSTEM_KEY,
  TEAM_CHAT_IMAGES_SYSTEM_KEY,
];

type DriveFileWithRelations = Prisma.DriveFileGetPayload<{
  include: {
    uploadedBy: true;
    ownerUser: true;
    tenant: { select: { id: true; name: true } };
    folder: true;
  };
}>;

type DriveFolderEntity = Prisma.DriveFolderGetPayload<Record<string, never>>;

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

  private sanitizeFolderName(value?: string | null) {
    const cleaned = this.sanitizeFileName(value);
    if (cleaned === 'Unbenannte Datei') {
      return 'Neuer Ordner';
    }
    return cleaned;
  }

  private isInternalTeamFolderSystemKey(value?: string | null) {
    if (!value) {
      return false;
    }
    return INTERNAL_TEAM_FOLDER_SYSTEM_KEYS.includes(value);
  }

  private isInternalProfileLogoName(value?: string | null) {
    const normalized = (value ?? '').trim().toLowerCase();
    return normalized.startsWith(INTERNAL_PROFILE_LOGO_NAME_PREFIX);
  }

  private isLegacyCustomerFolderName(value?: string | null) {
    const normalized = (value ?? '').trim().toLowerCase();
    return normalized.startsWith('kunde__');
  }

  private buildCustomerFolderName(customerName?: string | null) {
    const normalized = this.sanitizeFolderName(customerName);
    return normalized || 'Kunde';
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
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

  private toFolderResponse(folder: DriveFolderEntity) {
    const folderWithCounts = folder as DriveFolderEntity & {
      _count?: { files?: number };
    };
    return {
      id: folder.id,
      scope: folder.scope,
      kind: folder.kind,
      name: folder.name,
      fileCount: folderWithCounts._count?.files ?? 0,
      ownerUserId: folder.ownerUserId,
      parentId: folder.parentId,
      customerId: folder.customerId,
      systemKey: folder.systemKey,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    };
  }

  private async resolveFolderParent(params: {
    parentId: string;
    tenantId: string;
    scope: DriveScope;
    ownerUserId?: string | null;
  }) {
    const parent = await this.prisma.driveFolder.findFirst({
      where: {
        id: params.parentId,
        tenantId: params.tenantId,
      },
    });
    if (!parent) {
      throw new NotFoundException('Zielordner nicht gefunden.');
    }
    if (parent.scope !== params.scope) {
      throw new BadRequestException(
        'Zielordner muss im selben Bereich liegen.',
      );
    }
    if (parent.kind !== DriveFolderKind.GENERAL || parent.systemKey !== null) {
      throw new BadRequestException(
        'Systemordner können nicht als Zielordner verwendet werden.',
      );
    }
    if (params.scope === DriveScope.USER) {
      if (parent.ownerUserId !== params.ownerUserId) {
        throw new ForbiddenException(
          'Zielordner gehört einem anderen Benutzer.',
        );
      }
    }
    return parent;
  }

  private async assertNoCircularFolderMove(params: {
    tenantId: string;
    scope: DriveScope;
    folderId: string;
    nextParentId: string;
  }) {
    const nodes = await this.prisma.driveFolder.findMany({
      where: {
        tenantId: params.tenantId,
        scope: params.scope,
      },
      select: {
        id: true,
        parentId: true,
      },
    });
    const parentById = new Map<string, string | null>(
      nodes.map((node) => [node.id, node.parentId]),
    );

    let cursor: string | null = params.nextParentId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === params.folderId) {
        throw new BadRequestException(
          'Ordner kann nicht in sich selbst oder einen Unterordner verschoben werden.',
        );
      }
      if (visited.has(cursor)) {
        break;
      }
      visited.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
  }

  private async ensureCustomersRootFolderInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ) {
    const existing = await tx.driveFolder.findFirst({
      where: {
        tenantId,
        scope: DriveScope.TEAM,
        kind: DriveFolderKind.CUSTOMERS_ROOT,
        systemKey: TEAM_CUSTOMERS_ROOT_SYSTEM_KEY,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      if (
        existing.parentId === null &&
        existing.name === TEAM_CUSTOMERS_ROOT_NAME
      ) {
        return existing;
      }
      return tx.driveFolder.update({
        where: { id: existing.id },
        data: {
          parentId: null,
          name: TEAM_CUSTOMERS_ROOT_NAME,
          systemKey: TEAM_CUSTOMERS_ROOT_SYSTEM_KEY,
          kind: DriveFolderKind.CUSTOMERS_ROOT,
          scope: DriveScope.TEAM,
          ownerUserId: null,
        },
      });
    }

    try {
      return await tx.driveFolder.create({
        data: {
          tenantId,
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.CUSTOMERS_ROOT,
          name: TEAM_CUSTOMERS_ROOT_NAME,
          systemKey: TEAM_CUSTOMERS_ROOT_SYSTEM_KEY,
          parentId: null,
          ownerUserId: null,
          customerId: null,
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
          kind: DriveFolderKind.CUSTOMERS_ROOT,
          systemKey: TEAM_CUSTOMERS_ROOT_SYSTEM_KEY,
        },
        orderBy: { createdAt: 'asc' },
      });
      if (conflict) return conflict;
      throw error;
    }
  }

  private async ensureProfileLogosFolderInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ) {
    const existing = await tx.driveFolder.findFirst({
      where: {
        tenantId,
        scope: DriveScope.TEAM,
        kind: DriveFolderKind.GENERAL,
        systemKey: TEAM_PROFILE_LOGOS_SYSTEM_KEY,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      const expectedName = TEAM_PROFILE_LOGOS_FOLDER_NAME;
      if (
        existing.parentId === null &&
        existing.ownerUserId === null &&
        existing.customerId === null &&
        existing.scope === DriveScope.TEAM &&
        existing.kind === DriveFolderKind.GENERAL &&
        existing.systemKey === TEAM_PROFILE_LOGOS_SYSTEM_KEY &&
        existing.name === expectedName
      ) {
        return existing;
      }
      return tx.driveFolder.update({
        where: { id: existing.id },
        data: {
          parentId: null,
          ownerUserId: null,
          customerId: null,
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.GENERAL,
          systemKey: TEAM_PROFILE_LOGOS_SYSTEM_KEY,
          name: expectedName,
        },
      });
    }

    try {
      return await tx.driveFolder.create({
        data: {
          tenantId,
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.GENERAL,
          name: TEAM_PROFILE_LOGOS_FOLDER_NAME,
          systemKey: TEAM_PROFILE_LOGOS_SYSTEM_KEY,
          parentId: null,
          ownerUserId: null,
          customerId: null,
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
          systemKey: TEAM_PROFILE_LOGOS_SYSTEM_KEY,
        },
        orderBy: { createdAt: 'asc' },
      });
      if (conflict) {
        return conflict;
      }
      throw error;
    }
  }

  private async ensureCustomerFolderInTx(
    tx: Prisma.TransactionClient,
    params: { tenantId: string; customerId: string },
  ) {
    const customer = await tx.customer.findFirst({
      where: { id: params.customerId, tenantId: params.tenantId },
      select: { id: true, name: true },
    });
    if (!customer) {
      throw new NotFoundException('Kunde nicht gefunden.');
    }

    const root = await this.ensureCustomersRootFolderInTx(tx, params.tenantId);
    const expectedName = this.buildCustomerFolderName(customer.name);

    const existing = await tx.driveFolder.findFirst({
      where: {
        tenantId: params.tenantId,
        customerId: customer.id,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      const shouldRename =
        !existing.name ||
        this.isLegacyCustomerFolderName(existing.name) ||
        existing.name.trim() !== expectedName;
      const needsUpdate =
        existing.scope !== DriveScope.TEAM ||
        existing.kind !== DriveFolderKind.CUSTOMER ||
        existing.parentId !== root.id ||
        existing.systemKey !== null ||
        shouldRename;

      if (!needsUpdate) return existing;

      return tx.driveFolder.update({
        where: { id: existing.id },
        data: {
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.CUSTOMER,
          parentId: root.id,
          systemKey: null,
          ownerUserId: null,
          name: shouldRename ? expectedName : existing.name,
        },
      });
    }

    try {
      return await tx.driveFolder.create({
        data: {
          tenantId: params.tenantId,
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.CUSTOMER,
          name: expectedName,
          parentId: root.id,
          customerId: customer.id,
          ownerUserId: null,
          systemKey: null,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      const conflict = await tx.driveFolder.findFirst({
        where: {
          tenantId: params.tenantId,
          customerId: customer.id,
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!conflict) throw error;
      return tx.driveFolder.update({
        where: { id: conflict.id },
        data: {
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.CUSTOMER,
          parentId: root.id,
          systemKey: null,
          ownerUserId: null,
          name:
            this.isLegacyCustomerFolderName(conflict.name) ||
            !conflict.name?.trim()
              ? expectedName
              : conflict.name,
        },
      });
    }
  }

  private async reconcileAllCustomerFolders(tenantId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.ensureCustomersRootFolderInTx(tx, tenantId);
      const customers = await tx.customer.findMany({
        where: { tenantId },
        select: { id: true },
      });
      for (const customer of customers) {
        await this.ensureCustomerFolderInTx(tx, {
          tenantId,
          customerId: customer.id,
        });
      }
    });
  }

  private async ensureCustomerFolderStructureIfNeeded(tenantId: string) {
    const [customerCount, customerFolderCount, customersRootCount] =
      await this.prisma.$transaction([
        this.prisma.customer.count({
          where: { tenantId },
        }),
        this.prisma.driveFolder.count({
          where: {
            tenantId,
            scope: DriveScope.TEAM,
            kind: DriveFolderKind.CUSTOMER,
          },
        }),
        this.prisma.driveFolder.count({
          where: {
            tenantId,
            scope: DriveScope.TEAM,
            kind: DriveFolderKind.CUSTOMERS_ROOT,
            systemKey: TEAM_CUSTOMERS_ROOT_SYSTEM_KEY,
          },
        }),
      ]);

    if (customersRootCount === 0 || customerFolderCount < customerCount) {
      await this.reconcileAllCustomerFolders(tenantId);
    }
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

  async getCustomersRootFolder(user?: AuthUser) {
    const tenantId = this.requireTenantId();
    this.ensureTeamAccess(undefined, user);
    const folder = await this.prisma.$transaction((tx) =>
      this.ensureCustomersRootFolderInTx(tx, tenantId),
    );
    return this.toFolderResponse(folder);
  }

  async getCustomerFolder(customerId: string, user?: AuthUser) {
    const tenantId = this.requireTenantId();
    this.ensureTeamAccess(undefined, user);
    const folder = await this.prisma.$transaction((tx) =>
      this.ensureCustomerFolderInTx(tx, { tenantId, customerId }),
    );
    return this.toFolderResponse(folder);
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
      this.ensureTeamAccess(dto.teamId, user);
    }

    if (dto.folderId) {
      const folder = await this.ensureFolderAccess(
        dto.folderId,
        scope,
        dto.teamId,
        user,
      );
      if (
        scope === DriveScope.TEAM &&
        this.isInternalTeamFolderSystemKey(folder.systemKey)
      ) {
        throw new NotFoundException('Ordner nicht gefunden.');
      }
      where.folderId = dto.folderId;
    } else if (dto.unassigned) {
      where.folderId = null;
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
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
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

    if (scope === DriveScope.TEAM) {
      const hiddenFolderFilter: Prisma.DriveFileWhereInput = {
        folder: {
          is: {
            systemKey: { in: INTERNAL_TEAM_FOLDER_SYSTEM_KEYS },
          },
        },
      };
      where.NOT = Array.isArray(where.NOT)
        ? [...where.NOT, hiddenFolderFilter]
        : where.NOT
          ? [where.NOT, hiddenFolderFilter]
          : [hiddenFolderFilter];
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
          folder: true,
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
    const ownerUserId = scope === DriveScope.USER ? this.requireUserId() : null;
    if (scope === DriveScope.USER) {
      // Access check is the user id lookup above.
    } else {
      this.ensureTeamAccess(dto.teamId, user);
      await this.ensureCustomerFolderStructureIfNeeded(tenantId);
    }

    if (dto.parentId) {
      await this.ensureFolderAccess(dto.parentId, scope, dto.teamId, user);
    }

    const folderWhere: Prisma.DriveFolderWhereInput = {
      tenantId,
      scope,
      ownerUserId: scope === DriveScope.USER ? ownerUserId : undefined,
      parentId: dto.parentId ?? undefined,
    };
    if (scope === DriveScope.TEAM) {
      folderWhere.NOT = {
        systemKey: {
          in: INTERNAL_TEAM_FOLDER_SYSTEM_KEYS,
        },
      };
    }

    const folders = await this.prisma.driveFolder.findMany({
      where: folderWhere,
      include: {
        _count: {
          select: {
            files: {
              where: { isDeleted: false },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });
    return folders.map((folder) => this.toFolderResponse(folder));
  }

  async createFolder(dto: CreateDriveFolderDto, user?: AuthUser) {
    const tenantId = this.requireTenantId();
    const scope = dto.scope ?? DriveScope.USER;
    if (scope === DriveScope.USER) {
      const ownerId = this.requireUserId();
      let parentId: string | null = null;
      if (dto.parentId) {
        const parent = await this.resolveFolderParent({
          parentId: dto.parentId,
          tenantId,
          scope,
          ownerUserId: ownerId,
        });
        parentId = parent.id;
      }
      const folder = await this.prisma.driveFolder.create({
        data: {
          tenantId,
          scope,
          kind: DriveFolderKind.GENERAL,
          parentId,
          customerId: null,
          systemKey: null,
          ownerUserId: ownerId,
          name: this.sanitizeFolderName(dto.name),
        },
      });
      return this.toFolderResponse(folder);
    }
    this.ensureTeamAccess(dto.teamId, user);
    let parentId: string | null = null;
    if (dto.parentId) {
      const parent = await this.resolveFolderParent({
        parentId: dto.parentId,
        tenantId,
        scope,
      });
      parentId = parent.id;
    }
    const folder = await this.prisma.driveFolder.create({
      data: {
        tenantId,
        scope,
        kind: DriveFolderKind.GENERAL,
        parentId,
        customerId: null,
        systemKey: null,
        ownerUserId: null,
        name: this.sanitizeFolderName(dto.name),
      },
    });
    return this.toFolderResponse(folder);
  }

  async updateFolder(id: string, dto: UpdateDriveFolderDto, user?: AuthUser) {
    const tenantId = this.requireTenantId();
    const folder = await this.prisma.driveFolder.findFirst({
      where: { id, tenantId },
    });
    if (!folder) {
      throw new NotFoundException('Ordner nicht gefunden.');
    }
    if (folder.kind !== DriveFolderKind.GENERAL || folder.systemKey !== null) {
      throw new BadRequestException(
        'Systemordner können nicht bearbeitet werden.',
      );
    }
    const currentUserId = this.requireUserId();
    if (folder.scope === DriveScope.USER) {
      if (folder.ownerUserId !== currentUserId) {
        throw new ForbiddenException('Kein Zugriff auf diesen Ordner.');
      }
    } else {
      this.ensureTeamAccess(undefined, user);
    }
    let nextParentId = folder.parentId ?? null;
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException(
          'Ordner kann nicht in sich selbst verschoben werden.',
        );
      }
      if (dto.parentId === null) {
        nextParentId = null;
      } else {
        const parent = await this.resolveFolderParent({
          parentId: dto.parentId,
          tenantId,
          scope: folder.scope,
          ownerUserId: folder.scope === DriveScope.USER ? currentUserId : null,
        });
        await this.assertNoCircularFolderMove({
          tenantId,
          scope: folder.scope,
          folderId: folder.id,
          nextParentId: parent.id,
        });
        nextParentId = parent.id;
      }
    }
    const nextName = dto.name ? this.sanitizeFolderName(dto.name) : folder.name;

    if (
      nextName === folder.name &&
      nextParentId === (folder.parentId ?? null)
    ) {
      return this.toFolderResponse(folder);
    }

    const updated = await this.prisma.driveFolder.update({
      where: { id },
      data: {
        name: nextName,
        parentId: nextParentId,
      },
    });
    return this.toFolderResponse(updated);
  }

  async deleteFolder(id: string, user?: AuthUser) {
    const tenantId = this.requireTenantId();
    const folder = await this.prisma.driveFolder.findFirst({
      where: { id, tenantId },
    });
    if (!folder) {
      throw new NotFoundException('Ordner nicht gefunden.');
    }
    if (folder.kind !== DriveFolderKind.GENERAL || folder.systemKey !== null) {
      throw new BadRequestException(
        'Systemordner können nicht gelöscht werden.',
      );
    }
    if (folder.scope === DriveScope.USER) {
      if (folder.ownerUserId !== this.requireUserId()) {
        throw new ForbiddenException('Kein Zugriff auf diesen Ordner.');
      }
    } else {
      this.ensureTeamAccess(undefined, user);
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
    const resolvedName = this.sanitizeFileName(dto.name ?? file.originalname);
    const isInternalProfileLogoUpload =
      scope === DriveScope.TEAM && this.isInternalProfileLogoName(resolvedName);
    let resolvedFolderId = dto.folderId ?? null;
    if (isInternalProfileLogoUpload && !file.mimetype?.startsWith('image/')) {
      throw new BadRequestException(
        'Interner Profil-Logo-Upload erlaubt nur Bilddateien.',
      );
    }
    if (scope === DriveScope.TEAM) {
      this.ensureTeamAccess(dto.teamId, user);
    }
    if (isInternalProfileLogoUpload && !resolvedFolderId) {
      const profileLogosFolder = await this.prisma.$transaction((tx) =>
        this.ensureProfileLogosFolderInTx(tx, tenantId),
      );
      resolvedFolderId = profileLogosFolder.id;
    }
    if (resolvedFolderId) {
      const folder = await this.ensureFolderAccess(
        resolvedFolderId,
        scope,
        dto.teamId,
        user,
        { allowInternal: isInternalProfileLogoUpload },
      );
      if (
        scope === DriveScope.TEAM &&
        this.isInternalTeamFolderSystemKey(folder.systemKey) &&
        !isInternalProfileLogoUpload
      ) {
        throw new ForbiddenException(
          'Interner Ordner kann für diesen Upload nicht verwendet werden.',
        );
      }
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
        folderId: resolvedFolderId,
        name: resolvedName,
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

  async uploadCustomerFile(
    customerId: string,
    dto: UploadCustomerDriveFileDto,
    file: Express.Multer.File,
    user?: AuthUser,
  ): Promise<DriveFileResponse> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Upload-Datei fehlt oder ist leer.');
    }

    const tenantId = this.requireTenantId();
    const uploaderId = this.requireUserId();
    this.ensureTeamAccess(undefined, user);

    const customerFolder = await this.prisma.$transaction((tx) =>
      this.ensureCustomerFolderInTx(tx, { tenantId, customerId }),
    );

    const storageKey = await this.storage.saveFile({
      tenantId,
      buffer: file.buffer,
      originalName: file.originalname,
    });

    const entity = await this.prisma.driveFile.create({
      data: {
        tenantId,
        ownerUserId: null,
        uploadedById: uploaderId,
        scope: DriveScope.TEAM,
        folderId: customerFolder.id,
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
    if (
      file.scope === DriveScope.TEAM &&
      this.isInternalTeamFolderSystemKey(file.folder?.systemKey)
    ) {
      throw new ForbiddenException(
        'Interne Dateien können nicht verschoben oder umbenannt werden.',
      );
    }

    if (dto.folderId !== undefined && dto.folderId !== null) {
      await this.ensureFolderAccess(dto.folderId, file.scope, undefined, user);
    }
    if (dto.folderId === null && file.scope === DriveScope.TEAM) {
      this.ensureTeamAccess(undefined, user);
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
      throw new ForbiddenException(
        'Nur Team-Dateien sind öffentlich abrufbar.',
      );
    }
    if (this.isInternalTeamFolderSystemKey(file.folder?.systemKey)) {
      throw new ForbiddenException('Keine Berechtigung für diese Datei.');
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
      if (this.isInternalTeamFolderSystemKey(file.folder?.systemKey)) {
        if (!user?.sub || file.uploadedById !== user.sub) {
          throw new ForbiddenException('Keine Berechtigung für diese Datei.');
        }
        return;
      }
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
      this.isInternalTeamFolderSystemKey(file.folder?.systemKey)
    ) {
      if (file.uploadedById !== user.sub) {
        throw new ForbiddenException(
          'Nur der Uploader darf diese Datei ändern.',
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

  private ensureTeamAccess(teamId?: string, user?: AuthUser) {
    const tenantId = this.requireTenantId();
    const resolved = teamId ?? tenantId;
    if (resolved !== tenantId) {
      throw new ForbiddenException('Team gehört nicht zu diesem Workspace.');
    }
    if (!user?.sub) {
      throw new ForbiddenException('Benutzerkontext fehlt.');
    }
  }

  private async ensureFolderAccess(
    folderId: string,
    scope: DriveScope,
    teamId?: string,
    user?: AuthUser,
    options?: { allowInternal?: boolean },
  ) {
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
    if (
      scope === DriveScope.TEAM &&
      this.isInternalTeamFolderSystemKey(folder.systemKey) &&
      !options?.allowInternal
    ) {
      throw new NotFoundException('Ordner nicht gefunden.');
    }
    if (scope === DriveScope.USER) {
      if (folder.ownerUserId !== this.requireUserId()) {
        throw new ForbiddenException('Ordner gehört einem anderen Benutzer.');
      }
    } else {
      this.ensureTeamAccess(teamId, user);
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
        folder: true,
      },
    });
    if (!file) {
      throw new NotFoundException('Datei nicht gefunden.');
    }
    return file;
  }
}
