import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { extname } from 'node:path';
import {
  AppointmentSlotStatus,
  CustomerPackage,
  DriveFolderKind,
  DriveScope,
  Prisma,
  ServiceOrderStatus,
  UserRole,
} from '@prisma/client';
import type { Express } from 'express';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RequestContextService } from '@/infra/request-context/request-context.service';
import { DriveStorageService } from '@/modules/drive/drive-storage.service';

import { UpdateProjectProfileDto } from './dto/update-project-profile.dto';

const TEAM_CUSTOMERS_ROOT_SYSTEM_KEY = 'team_customers_root';
const TEAM_CUSTOMERS_ROOT_NAME = 'Kunden';
const CUSTOMER_PROJECT_PROFILE_KEY_PREFIX = 'customer_project_profile_';
const CUSTOMER_LOGO_FOLDER_KEY_PREFIX = 'customer_logo_';
const CUSTOMER_MEDIA_FOLDER_KEY_PREFIX = 'customer_media_';
const CUSTOMER_LOGO_BASE_NAME = 'unternehmenslogo';

type CustomerAssetKind = 'logo' | 'media';

interface ProjectProfileExtras {
  legalName: string | null;
  website: string | null;
  industry: string | null;
  companySize: string | null;
  primaryContactName: string | null;
  billingEmail: string | null;
  projectGoals: string | null;
  brandNotes: string | null;
}

type PortalFileEntity = Prisma.DriveFileGetPayload<{
  include: {
    uploadedBy: {
      select: {
        firstName: true;
        lastName: true;
        email: true;
      };
    };
  };
}>;

@Injectable()
export class CustomerPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly storage: DriveStorageService,
  ) {}

  async getHome() {
    const portal = await this.requirePortalContext();
    const now = new Date();
    const today = this.toDateOnly(now);
    const nowTime = this.toTimeOnly(now);

    const [
      totalOrders,
      openOrders,
      completedOrders,
      totalFiles,
      nextAppointment,
      recentServiceOrders,
    ] = await this.prisma.$transaction([
      this.prisma.serviceOrder.count({
        where: {
          tenantId: portal.tenantId,
          customerId: portal.customer.id,
        },
      }),
      this.prisma.serviceOrder.count({
        where: {
          tenantId: portal.tenantId,
          customerId: portal.customer.id,
          status: {
            in: [ServiceOrderStatus.PLANNED, ServiceOrderStatus.IN_SERVICE],
          },
        },
      }),
      this.prisma.serviceOrder.count({
        where: {
          tenantId: portal.tenantId,
          customerId: portal.customer.id,
          status: ServiceOrderStatus.COMPLETED,
        },
      }),
      this.prisma.driveFile.count({
        where: {
          tenantId: portal.tenantId,
          scope: DriveScope.TEAM,
          isDeleted: false,
          folder: {
            is: {
              tenantId: portal.tenantId,
              OR: [
                {
                  customerId: portal.customer.id,
                },
                {
                  parent: {
                    is: {
                      customerId: portal.customer.id,
                    },
                  },
                },
              ],
            },
          },
        },
      }),
      this.prisma.appointmentSlot.findFirst({
        where: {
          tenantId: portal.tenantId,
          customerId: portal.customer.id,
          status: AppointmentSlotStatus.BLOCKED,
          canceledAt: null,
          OR: [
            { date: { gt: today } },
            {
              date: today,
              startTime: { gte: nowTime },
            },
          ],
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.serviceOrder.findMany({
        where: {
          tenantId: portal.tenantId,
          customerId: portal.customer.id,
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          advisorName: true,
          scheduledAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      customer: {
        id: portal.customer.id,
        name: portal.customer.name,
        type: portal.customer.type,
        customerPackage: portal.customer.customerPackage,
        packageServices: this.coercePackageServices(
          portal.customer.packageServices,
          portal.customer.customerPackage,
        ),
        email: portal.customer.email,
        phone: portal.customer.phone,
        city: portal.customer.city,
      },
      stats: {
        totalOrders,
        openOrders,
        completedOrders,
        totalFiles,
      },
      nextAppointment: nextAppointment
        ? {
            id: nextAppointment.id,
            title: nextAppointment.title,
            date: nextAppointment.date,
            startTime: nextAppointment.startTime,
            endTime: nextAppointment.endTime,
            meetingLink: nextAppointment.meetingLink,
          }
        : null,
      recentServiceOrders: recentServiceOrders.map((order) => ({
        id: order.id,
        title: order.title,
        status: order.status,
        advisorName: order.advisorName,
        scheduledAt: order.scheduledAt?.toISOString() ?? null,
        updatedAt: order.updatedAt.toISOString(),
      })),
    };
  }

  async getProjectProfile() {
    const portal = await this.requirePortalContext();
    const [extras, logoFolder, mediaFolder] = await Promise.all([
      this.readProjectProfileExtras(portal.tenantId, portal.customer.id),
      this.ensureCustomerAssetFolder(
        portal.tenantId,
        portal.customer.id,
        portal.customer.name,
        'logo',
      ),
      this.ensureCustomerAssetFolder(
        portal.tenantId,
        portal.customer.id,
        portal.customer.name,
        'media',
      ),
    ]);

    const [logo, media] = await Promise.all([
      this.prisma.driveFile.findFirst({
        where: {
          tenantId: portal.tenantId,
          scope: DriveScope.TEAM,
          isDeleted: false,
          folderId: logoFolder.id,
        },
        include: {
          uploadedBy: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.driveFile.findMany({
        where: {
          tenantId: portal.tenantId,
          scope: DriveScope.TEAM,
          isDeleted: false,
          folderId: mediaFolder.id,
        },
        include: {
          uploadedBy: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 120,
      }),
    ]);

    return {
      profile: {
        customerId: portal.customer.id,
        name: portal.customer.name,
        email: portal.customer.email,
        phone: portal.customer.phone,
        mobile: portal.customer.mobile,
        street: portal.customer.street,
        postalCode: portal.customer.postalCode,
        city: portal.customer.city,
        preferredChannel: portal.customer.preferredChannel,
        notes: portal.customer.notes,
        legalName: extras.legalName,
        website: extras.website,
        industry: extras.industry,
        companySize: extras.companySize,
        primaryContactName: extras.primaryContactName,
        billingEmail: extras.billingEmail,
        projectGoals: extras.projectGoals,
        brandNotes: extras.brandNotes,
      },
      assets: {
        logo: logo ? this.toPortalFileResponse(logo) : null,
        media: media.map((item) => this.toPortalFileResponse(item)),
      },
    };
  }

  async updateProjectProfile(dto: UpdateProjectProfileDto) {
    const portal = await this.requirePortalContext();
    const data: Prisma.CustomerUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = this.normalizeRequiredName(dto.name, 'Firmenname');
    }
    if (dto.email !== undefined) {
      data.email = this.normalizeNullableText(dto.email);
    }
    if (dto.phone !== undefined) {
      data.phone = this.normalizeNullableText(dto.phone);
    }
    if (dto.mobile !== undefined) {
      data.mobile = this.normalizeNullableText(dto.mobile);
    }
    if (dto.street !== undefined) {
      data.street = this.normalizeNullableText(dto.street);
    }
    if (dto.postalCode !== undefined) {
      data.postalCode = this.normalizeNullableText(dto.postalCode);
    }
    if (dto.city !== undefined) {
      data.city = this.normalizeNullableText(dto.city);
    }
    if (dto.preferredChannel !== undefined) {
      data.preferredChannel = this.normalizeNullableText(dto.preferredChannel);
    }
    if (dto.notes !== undefined) {
      data.notes = this.normalizeNullableText(dto.notes);
    }

    if (Object.keys(data).length) {
      await this.prisma.customer.update({
        where: {
          id: portal.customer.id,
          tenantId: portal.tenantId,
        },
        data,
      });
    }

    const hasExtraPayload = [
      dto.legalName,
      dto.website,
      dto.industry,
      dto.companySize,
      dto.primaryContactName,
      dto.billingEmail,
      dto.projectGoals,
      dto.brandNotes,
    ].some((entry) => entry !== undefined);

    if (hasExtraPayload) {
      const currentExtras = await this.readProjectProfileExtras(
        portal.tenantId,
        portal.customer.id,
      );
      const nextExtras: ProjectProfileExtras = {
        ...currentExtras,
        legalName:
          dto.legalName !== undefined
            ? this.normalizeNullableText(dto.legalName)
            : currentExtras.legalName,
        website:
          dto.website !== undefined
            ? this.normalizeNullableText(dto.website)
            : currentExtras.website,
        industry:
          dto.industry !== undefined
            ? this.normalizeNullableText(dto.industry)
            : currentExtras.industry,
        companySize:
          dto.companySize !== undefined
            ? this.normalizeNullableText(dto.companySize)
            : currentExtras.companySize,
        primaryContactName:
          dto.primaryContactName !== undefined
            ? this.normalizeNullableText(dto.primaryContactName)
            : currentExtras.primaryContactName,
        billingEmail:
          dto.billingEmail !== undefined
            ? this.normalizeNullableText(dto.billingEmail)
            : currentExtras.billingEmail,
        projectGoals:
          dto.projectGoals !== undefined
            ? this.normalizeNullableText(dto.projectGoals)
            : currentExtras.projectGoals,
        brandNotes:
          dto.brandNotes !== undefined
            ? this.normalizeNullableText(dto.brandNotes)
            : currentExtras.brandNotes,
      };

      const key = this.projectProfileSettingKey(portal.customer.id);
      await this.prisma.tenantSetting.upsert({
        where: {
          tenantId_key: {
            tenantId: portal.tenantId,
            key,
          },
        },
        create: {
          tenantId: portal.tenantId,
          key,
          value: nextExtras as unknown as Prisma.InputJsonValue,
        },
        update: {
          value: nextExtras as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return this.getProjectProfile();
  }

  async uploadProjectLogo(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Logo-Datei fehlt oder ist leer.');
    }
    if (!this.isImageMime(file.mimetype)) {
      throw new BadRequestException('Logo muss ein Bildformat sein.');
    }

    const portal = await this.requirePortalContext();
    const folder = await this.ensureCustomerAssetFolder(
      portal.tenantId,
      portal.customer.id,
      portal.customer.name,
      'logo',
    );

    const created = await this.storePortalFile({
      tenantId: portal.tenantId,
      userId: portal.userId,
      folderId: folder.id,
      file,
      name: this.buildLogoFileName(file.originalname),
    });

    const archivedFiles = await this.archiveFilesInFolder(
      portal.tenantId,
      folder.id,
      created.id,
    );
    await this.deleteStoredFiles(archivedFiles);

    return {
      item: this.toPortalFileResponse(created),
    };
  }

  async deleteProjectLogo() {
    const portal = await this.requirePortalContext();
    const folder = await this.ensureCustomerAssetFolder(
      portal.tenantId,
      portal.customer.id,
      portal.customer.name,
      'logo',
    );
    const archivedFiles = await this.archiveFilesInFolder(
      portal.tenantId,
      folder.id,
    );
    await this.deleteStoredFiles(archivedFiles);
    return {
      success: true,
    };
  }

  async uploadProjectMedia(files: Array<Express.Multer.File>) {
    const validFiles = files.filter((entry) => Boolean(entry?.buffer?.length));
    if (!validFiles.length) {
      throw new BadRequestException('Upload-Dateien fehlen oder sind leer.');
    }

    const portal = await this.requirePortalContext();
    const folder = await this.ensureCustomerAssetFolder(
      portal.tenantId,
      portal.customer.id,
      portal.customer.name,
      'media',
    );

    const createdFiles = await Promise.all(
      validFiles.map((file) =>
        this.storePortalFile({
          tenantId: portal.tenantId,
          userId: portal.userId,
          folderId: folder.id,
          file,
          name: this.sanitizeName(file.originalname),
        }),
      ),
    );

    return {
      items: createdFiles.map((entry) => this.toPortalFileResponse(entry)),
    };
  }

  async deleteProjectMedia(fileId: string) {
    const portal = await this.requirePortalContext();
    const folder = await this.ensureCustomerAssetFolder(
      portal.tenantId,
      portal.customer.id,
      portal.customer.name,
      'media',
    );

    const target = await this.prisma.driveFile.findFirst({
      where: {
        id: fileId,
        tenantId: portal.tenantId,
        scope: DriveScope.TEAM,
        isDeleted: false,
        folderId: folder.id,
      },
      select: {
        id: true,
        storageKey: true,
      },
    });

    if (!target) {
      throw new NotFoundException('Bildmaterial wurde nicht gefunden.');
    }

    await this.prisma.driveFile.update({
      where: { id: target.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
    await this.deleteStoredFiles([target]);

    return {
      success: true,
    };
  }

  async listFiles() {
    const portal = await this.requirePortalContext();
    const folder = await this.ensureCustomerFolder(
      portal.tenantId,
      portal.customer.id,
      portal.customer.name,
    );

    const items = await this.prisma.driveFile.findMany({
      where: {
        tenantId: portal.tenantId,
        scope: DriveScope.TEAM,
        isDeleted: false,
        folderId: folder.id,
      },
      include: {
        uploadedBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      items: items.map((item) => this.toPortalFileResponse(item)),
    };
  }

  async uploadFile(file: Express.Multer.File, name?: string | null) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Upload-Datei fehlt oder ist leer.');
    }

    const portal = await this.requirePortalContext();
    const folder = await this.ensureCustomerFolder(
      portal.tenantId,
      portal.customer.id,
      portal.customer.name,
    );

    const storageKey = await this.storage.saveFile({
      tenantId: portal.tenantId,
      buffer: file.buffer,
      originalName: file.originalname,
    });

    const created = await this.prisma.driveFile.create({
      data: {
        tenantId: portal.tenantId,
        ownerUserId: null,
        uploadedById: portal.userId,
        scope: DriveScope.TEAM,
        folderId: folder.id,
        name: this.sanitizeName(name ?? file.originalname),
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
        storageKey,
      },
      include: {
        uploadedBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return this.toPortalFileResponse(created);
  }

  async getDownload(fileId: string) {
    const portal = await this.requirePortalContext();
    const file = await this.prisma.driveFile.findFirst({
      where: {
        id: fileId,
        tenantId: portal.tenantId,
        scope: DriveScope.TEAM,
        isDeleted: false,
        folder: {
          is: {
            OR: [
              {
                customerId: portal.customer.id,
              },
              {
                parent: {
                  is: {
                    customerId: portal.customer.id,
                  },
                },
              },
            ],
          },
        },
      },
    });

    if (!file) {
      throw new NotFoundException('Datei nicht gefunden.');
    }

    const opened = await this.storage.openFile(file.storageKey);
    return {
      stream: opened.stream,
      size: opened.size,
      fileName: file.name,
      mimeType: file.mimeType || 'application/octet-stream',
    };
  }

  private async requirePortalContext() {
    const tenantId = this.context.getTenantId();
    const userId = this.context.getUserId();
    const role = this.context.getRole();
    const customerId = this.context.getCustomerId();

    if (!tenantId || !userId || !customerId || role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Kein Zugriff auf den Kundenbereich.');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        mobile: true,
        street: true,
        postalCode: true,
        city: true,
        preferredChannel: true,
        notes: true,
        type: true,
        customerPackage: true,
        packageServices: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Kunde wurde nicht gefunden.');
    }

    return {
      tenantId,
      userId,
      customer,
    };
  }

  private coercePackageServices(
    value: Prisma.JsonValue | null | undefined,
    customerPackage: CustomerPackage,
  ) {
    if (!Array.isArray(value)) {
      return this.defaultPackageServices(customerPackage);
    }

    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }
        const row = entry as Record<string, unknown>;
        const id =
          typeof row.id === 'string' && row.id.trim() ? row.id.trim() : null;
        const title = typeof row.title === 'string' ? row.title.trim() : '';
        const description =
          typeof row.description === 'string' ? row.description.trim() : null;
        if (!id || !title) {
          return null;
        }
        return {
          id,
          title,
          description,
        };
      })
      .filter(
        (
          entry,
        ): entry is { id: string; title: string; description: string | null } =>
          Boolean(entry),
      );
  }

  private defaultPackageServices(customerPackage: CustomerPackage) {
    const templates: Record<
      CustomerPackage,
      Array<{ id: string; title: string; description: string }>
    > = {
      STARTER: [
        {
          id: 'starter-onboarding',
          title: 'Onboarding & Setup',
          description: 'Technisches Setup und gemeinsamer Start-Call.',
        },
        {
          id: 'starter-reporting',
          title: 'Monatliches Reporting',
          description: 'Leistungsbericht mit nächsten empfohlenen Schritten.',
        },
      ],
      GROWTH: [
        {
          id: 'growth-automation',
          title: 'Automations-Optimierung',
          description: 'Kontinuierliche Optimierung von Workflows und Funnel.',
        },
        {
          id: 'growth-strategy',
          title: 'Strategie-Sparring',
          description: 'Regelmäßige Abstimmung zu KPIs und Prioritäten.',
        },
      ],
      ENTERPRISE: [
        {
          id: 'enterprise-integration',
          title: 'Individuelle Integrationen',
          description: 'Schnittstellen und individuelle Prozessanpassungen.',
        },
        {
          id: 'enterprise-priority',
          title: 'Priorisierter Support',
          description:
            'Bevorzugte Bearbeitung mit dediziertem Ansprechpartner.',
        },
      ],
    };

    return templates[customerPackage].map((service) => ({
      id: service.id,
      title: service.title,
      description: service.description,
    }));
  }

  private defaultProjectProfileExtras(): ProjectProfileExtras {
    return {
      legalName: null,
      website: null,
      industry: null,
      companySize: null,
      primaryContactName: null,
      billingEmail: null,
      projectGoals: null,
      brandNotes: null,
    };
  }

  private projectProfileSettingKey(customerId: string) {
    return `${CUSTOMER_PROJECT_PROFILE_KEY_PREFIX}${customerId}`;
  }

  private normalizeRequiredName(value: string, label: string) {
    const cleaned = value.trim();
    if (!cleaned) {
      throw new BadRequestException(`${label} darf nicht leer sein.`);
    }
    return cleaned.slice(0, 191);
  }

  private normalizeNullableText(value: string | null | undefined) {
    const cleaned = (value ?? '').trim();
    if (!cleaned) {
      return null;
    }
    return cleaned;
  }

  private normalizeProjectExtras(value: Prisma.JsonValue | null | undefined) {
    const fallback = this.defaultProjectProfileExtras();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return fallback;
    }

    const source = value as Record<string, unknown>;
    return {
      legalName: this.normalizeNullableTextFromUnknown(source.legalName),
      website: this.normalizeNullableTextFromUnknown(source.website),
      industry: this.normalizeNullableTextFromUnknown(source.industry),
      companySize: this.normalizeNullableTextFromUnknown(source.companySize),
      primaryContactName: this.normalizeNullableTextFromUnknown(
        source.primaryContactName,
      ),
      billingEmail: this.normalizeNullableTextFromUnknown(source.billingEmail),
      projectGoals: this.normalizeNullableTextFromUnknown(source.projectGoals),
      brandNotes: this.normalizeNullableTextFromUnknown(source.brandNotes),
    };
  }

  private normalizeNullableTextFromUnknown(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }
    return this.normalizeNullableText(value);
  }

  private async readProjectProfileExtras(tenantId: string, customerId: string) {
    const key = this.projectProfileSettingKey(customerId);
    const setting = await this.prisma.tenantSetting.findUnique({
      where: {
        tenantId_key: {
          tenantId,
          key,
        },
      },
      select: {
        value: true,
      },
    });

    return this.normalizeProjectExtras(setting?.value);
  }

  private customerAssetFolderSystemKey(
    customerId: string,
    assetKind: CustomerAssetKind,
  ) {
    return assetKind === 'logo'
      ? `${CUSTOMER_LOGO_FOLDER_KEY_PREFIX}${customerId}`
      : `${CUSTOMER_MEDIA_FOLDER_KEY_PREFIX}${customerId}`;
  }

  private customerAssetFolderName(assetKind: CustomerAssetKind) {
    return assetKind === 'logo' ? 'Unternehmenslogo' : 'Bildmaterial';
  }

  private async ensureCustomerAssetFolderInTx(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      customerId: string;
      customerName?: string | null;
      assetKind: CustomerAssetKind;
    },
  ) {
    const customerFolder = await this.ensureCustomerFolderInTx(tx, params);
    const systemKey = this.customerAssetFolderSystemKey(
      params.customerId,
      params.assetKind,
    );
    const expectedName = this.customerAssetFolderName(params.assetKind);

    const existing = await tx.driveFolder.findFirst({
      where: {
        tenantId: params.tenantId,
        kind: DriveFolderKind.GENERAL,
        systemKey,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return tx.driveFolder.update({
        where: { id: existing.id },
        data: {
          tenantId: params.tenantId,
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.GENERAL,
          parentId: customerFolder.id,
          ownerUserId: null,
          customerId: null,
          systemKey,
          name: expectedName,
        },
      });
    }

    try {
      return await tx.driveFolder.create({
        data: {
          tenantId: params.tenantId,
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.GENERAL,
          parentId: customerFolder.id,
          ownerUserId: null,
          customerId: null,
          systemKey,
          name: expectedName,
        },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const conflict = await tx.driveFolder.findFirst({
        where: {
          tenantId: params.tenantId,
          kind: DriveFolderKind.GENERAL,
          systemKey,
        },
      });
      if (!conflict) {
        throw error;
      }
      return conflict;
    }
  }

  private async ensureCustomerAssetFolder(
    tenantId: string,
    customerId: string,
    customerName: string | null | undefined,
    assetKind: CustomerAssetKind,
  ) {
    return this.prisma.$transaction((tx) =>
      this.ensureCustomerAssetFolderInTx(tx, {
        tenantId,
        customerId,
        customerName,
        assetKind,
      }),
    );
  }

  private isImageMime(value?: string | null) {
    return Boolean(value && value.toLowerCase().startsWith('image/'));
  }

  private buildLogoFileName(originalName?: string | null) {
    const extension = extname(originalName ?? '')
      .toLowerCase()
      .replace(/[^.\w]/g, '')
      .slice(0, 10);
    return `${CUSTOMER_LOGO_BASE_NAME}${extension || '.png'}`;
  }

  private async storePortalFile(params: {
    tenantId: string;
    userId: string;
    folderId: string;
    file: Express.Multer.File;
    name: string;
  }): Promise<PortalFileEntity> {
    const storageKey = await this.storage.saveFile({
      tenantId: params.tenantId,
      buffer: params.file.buffer,
      originalName: params.file.originalname,
    });

    try {
      return await this.prisma.driveFile.create({
        data: {
          tenantId: params.tenantId,
          ownerUserId: null,
          uploadedById: params.userId,
          scope: DriveScope.TEAM,
          folderId: params.folderId,
          name: this.sanitizeName(params.name),
          mimeType: params.file.mimetype || 'application/octet-stream',
          size: params.file.size,
          storageKey,
        },
        include: {
          uploadedBy: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      await this.storage.deleteFile(storageKey);
      throw error;
    }
  }

  private async archiveFilesInFolder(
    tenantId: string,
    folderId: string,
    keepFileId?: string,
  ) {
    const files = await this.prisma.driveFile.findMany({
      where: {
        tenantId,
        scope: DriveScope.TEAM,
        folderId,
        isDeleted: false,
        id: keepFileId
          ? {
              not: keepFileId,
            }
          : undefined,
      },
      select: {
        id: true,
        storageKey: true,
      },
    });

    if (!files.length) {
      return files;
    }

    await this.prisma.driveFile.updateMany({
      where: {
        id: {
          in: files.map((file) => file.id),
        },
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    return files;
  }

  private async deleteStoredFiles(
    files: Array<{ storageKey: string }>,
  ): Promise<void> {
    await Promise.all(
      files.map((file) =>
        this.storage.deleteFile(file.storageKey).catch(() => undefined),
      ),
    );
  }

  private toDateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private toTimeOnly(value: Date) {
    return value.toISOString().slice(11, 16);
  }

  private sanitizeName(value?: string | null) {
    const cleaned = (value ?? '').replace(/[\\/]/g, ' ').trim();
    if (!cleaned) {
      return 'Datei';
    }
    return cleaned.slice(0, 255);
  }

  private formatUploaderName(input: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  }) {
    const fullName = [input.firstName, input.lastName]
      .map((entry) => entry?.trim())
      .filter((entry): entry is string => Boolean(entry && entry.length))
      .join(' ');
    if (fullName) {
      return fullName;
    }
    return input.email ?? 'Team';
  }

  private toPortalFileResponse(file: PortalFileEntity) {
    return {
      id: file.id,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
      createdAt: file.createdAt.toISOString(),
      uploadedByName: this.formatUploaderName(file.uploadedBy),
    };
  }

  private buildCustomerFolderName(customerName?: string | null) {
    const cleaned = this.sanitizeName(customerName);
    return cleaned === 'Datei' ? 'Kunde' : cleaned;
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
          customerId: null,
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
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const conflict = await tx.driveFolder.findFirst({
        where: {
          tenantId,
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.CUSTOMERS_ROOT,
          systemKey: TEAM_CUSTOMERS_ROOT_SYSTEM_KEY,
        },
      });
      if (!conflict) {
        throw error;
      }
      return conflict;
    }
  }

  private async ensureCustomerFolderInTx(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      customerId: string;
      customerName?: string | null;
    },
  ) {
    const root = await this.ensureCustomersRootFolderInTx(tx, params.tenantId);
    const expectedName = this.buildCustomerFolderName(params.customerName);
    const existing = await tx.driveFolder.findFirst({
      where: {
        tenantId: params.tenantId,
        customerId: params.customerId,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return tx.driveFolder.update({
        where: { id: existing.id },
        data: {
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.CUSTOMER,
          parentId: root.id,
          customerId: params.customerId,
          ownerUserId: null,
          systemKey: null,
          name: expectedName,
        },
      });
    }

    try {
      return await tx.driveFolder.create({
        data: {
          tenantId: params.tenantId,
          scope: DriveScope.TEAM,
          kind: DriveFolderKind.CUSTOMER,
          parentId: root.id,
          customerId: params.customerId,
          ownerUserId: null,
          systemKey: null,
          name: expectedName,
        },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const conflict = await tx.driveFolder.findFirst({
        where: {
          tenantId: params.tenantId,
          customerId: params.customerId,
        },
      });
      if (!conflict) {
        throw error;
      }
      return conflict;
    }
  }

  private async ensureCustomerFolder(
    tenantId: string,
    customerId: string,
    customerName?: string | null,
  ) {
    return this.prisma.$transaction((tx) =>
      this.ensureCustomerFolderInTx(tx, { tenantId, customerId, customerName }),
    );
  }
}
