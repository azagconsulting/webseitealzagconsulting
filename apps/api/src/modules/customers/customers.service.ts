import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerPackage,
  CustomerType,
  Prisma,
  ServiceOrderStatus,
  User,
  UserRole,
  VehicleFuelType,
  VehicleTransmission,
  CustomerContact,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';

import type { SanitizedUser } from '../auth/auth.types';
import { EmailService } from '../../infra/mailer/email.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import { SettingsService } from '../settings/settings.service';
import {
  CreateCustomerDto,
  CreateCustomerContactDto,
  CreateVehicleDto,
} from './dto/create-customer.dto';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { InviteCustomerPortalUserDto } from './dto/invite-customer-portal-user.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import {
  UpdateCustomerContactDto,
  UpdateCustomerDto,
} from './dto/update-customer.dto';

type CustomerWithRelations = Prisma.CustomerGetPayload<{
  include: {
    contacts: true;
    vehicles: true;
    serviceOrders: { orderBy: { createdAt: 'desc' } };
    _count: { select: { portalUsers: true } };
  };
}>;
type VehicleEntity = Prisma.VehicleGetPayload<Record<string, never>>;
type ServiceOrderEntity = Prisma.ServiceOrderGetPayload<Record<string, never>>;

interface CustomerContactResponse {
  id: string;
  name: string;
  role?: string | null;
  channel?: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VehicleResponse {
  id: string;
  manufacturer?: string | null;
  model?: string | null;
  trim?: string | null;
  licensePlate?: string | null;
  vin?: string | null;
  year?: number | null;
  mileageKm?: number | null;
  fuelType?: VehicleFuelType | null;
  transmission?: VehicleTransmission | null;
  color?: string | null;
  lastServiceAt?: string | null;
  nextServiceAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceOrderResponse {
  id: string;
  vehicleId?: string | null;
  title: string;
  concern?: string | null;
  status: ServiceOrderStatus;
  advisorName?: string | null;
  technicianName?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
  odometerKm?: number | null;
  estimateCents?: number | null;
  totalCents?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CustomerPackageServiceResponse {
  id: string;
  title: string;
  description: string | null;
}

export interface CustomerResponse {
  id: string;
  name: string;
  type: CustomerType;
  customerPackage: CustomerPackage;
  packageServices: CustomerPackageServiceResponse[];
  portalAccessEnabled: boolean;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  preferredChannel?: string | null;
  marketingOptIn: boolean;
  notes?: string | null;
  tags: string[];
  totalSpendCents: number;
  lastContactAt?: string | null;
  contacts: CustomerContactResponse[];
  vehicles: VehicleResponse[];
  serviceOrders: ServiceOrderResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListResponse {
  items: CustomerResponse[];
  stats: {
    total: number;
    privateCustomers: number;
    businessCustomers: number;
    fleetCustomers: number;
    openServiceOrders: number;
    vehicles: number;
  };
}

export interface CustomerImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface InviteCustomerPortalUserResponse {
  user: SanitizedUser;
  temporaryPassword: string;
  inviteEmailSent: boolean;
  inviteEmailError?: string;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
  ) {}

  async listCustomers(dto: ListCustomersDto): Promise<CustomerListResponse> {
    const tenantId = this.requireTenantId();
    const where: Prisma.CustomerWhereInput = { tenantId };

    if (dto.type) {
      where.type = dto.type;
    }

    if (dto.search?.trim()) {
      const query = dto.search.trim();
      where.OR = [
        { name: { contains: query } },
        { email: { contains: query } },
        { phone: { contains: query } },
        { vehicles: { some: { licensePlate: { contains: query } } } },
        { vehicles: { some: { vin: { contains: query } } } },
      ];
    }

    const take = dto.limit ?? 25;

    const customers = await this.prisma.customer.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        contacts: { orderBy: { createdAt: 'asc' } },
        vehicles: { orderBy: { createdAt: 'desc' } },
        serviceOrders: {
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { portalUsers: true },
        },
      },
    });

    const stats = this.buildStats(customers);

    return {
      items: customers.map((customer) => this.toResponse(customer)),
      stats,
    };
  }

  async createCustomer(dto: CreateCustomerDto): Promise<CustomerResponse> {
    const tenantId = this.requireTenantId();
    const tags =
      dto.tags?.map((tag) => tag.trim()).filter((tag) => !!tag) ?? [];
    const selectedPackage = dto.customerPackage ?? CustomerPackage.STARTER;
    const packageServices =
      dto.packageServices !== undefined
        ? this.normalizePackageServices(dto.packageServices)
        : this.normalizePackageServices(
            this.defaultPackageServices(selectedPackage),
          );

    const customer = await this.prisma.customer.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        type: dto.type,
        customerPackage: selectedPackage,
        packageServices,
        email: dto.email?.trim() || undefined,
        phone: dto.phone?.trim() || undefined,
        mobile: dto.mobile?.trim() || undefined,
        street: dto.street?.trim() || undefined,
        postalCode: dto.postalCode?.trim() || undefined,
        city: dto.city?.trim() || undefined,
        preferredChannel: dto.preferredChannel?.trim() || undefined,
        marketingOptIn: dto.marketingOptIn ?? false,
        notes: dto.notes?.trim() || undefined,
        tags,
        lastContactAt: dto.lastContactAt
          ? new Date(dto.lastContactAt)
          : undefined,
        contacts: dto.contacts?.length
          ? {
              create: dto.contacts.map((contact) =>
                this.toContactCreate(contact),
              ),
            }
          : undefined,
        vehicles: dto.vehicles?.length
          ? {
              create: dto.vehicles.map((vehicle) =>
                this.toVehicleCreate(vehicle, tenantId),
              ),
            }
          : undefined,
      },
      include: {
        contacts: true,
        vehicles: true,
        serviceOrders: true,
        _count: {
          select: { portalUsers: true },
        },
      },
    });

    return this.toResponse(customer);
  }

  async updateCustomer(
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerResponse> {
    const tenantId = this.requireTenantId();
    const data: Prisma.CustomerUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.customerPackage !== undefined)
      data.customerPackage = dto.customerPackage;
    if (dto.packageServices !== undefined) {
      data.packageServices = this.normalizePackageServices(dto.packageServices);
    }
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.mobile !== undefined) data.mobile = dto.mobile?.trim() || null;
    if (dto.street !== undefined) data.street = dto.street?.trim() || null;
    if (dto.postalCode !== undefined)
      data.postalCode = dto.postalCode?.trim() || null;
    if (dto.city !== undefined) data.city = dto.city?.trim() || null;
    if (dto.preferredChannel !== undefined)
      data.preferredChannel = dto.preferredChannel?.trim() || null;
    if (dto.marketingOptIn !== undefined)
      data.marketingOptIn = dto.marketingOptIn;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.tags !== undefined)
      data.tags = dto.tags.map((tag) => tag.trim()).filter(Boolean);
    if (dto.totalSpendCents !== undefined)
      data.totalSpendCents = dto.totalSpendCents;
    if (dto.lastContactAt !== undefined) {
      data.lastContactAt = dto.lastContactAt
        ? new Date(dto.lastContactAt)
        : null;
    }

    await this.prisma.customer.update({
      where: { id, tenantId },
      data,
    });

    await this.upsertPrimaryContact(id, dto.primaryContact);

    return this.findCustomer(id);
  }

  async createContact(
    customerId: string,
    dto: CreateCustomerContactDto,
  ): Promise<CustomerContact> {
    const tenantId = this.requireTenantId();
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });
    if (!customer) {
      throw new NotFoundException('Kunde wurde nicht gefunden.');
    }

    const contact = await this.prisma.customerContact.create({
      data: {
        customerId,
        ...this.toContactCreate(dto),
      },
    });

    return contact;
  }

  async inviteCustomerPortalUser(
    customerId: string,
    dto: InviteCustomerPortalUserDto,
  ): Promise<InviteCustomerPortalUserResponse> {
    this.ensureCanInvitePortalUsers();
    const tenantId = this.requireTenantId();
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { id: true, name: true, email: true },
    });

    if (!customer) {
      throw new NotFoundException('Kunde wurde nicht gefunden.');
    }

    const email = (
      dto.email?.trim() ||
      customer.email?.trim() ||
      ''
    ).toLowerCase();
    if (!email) {
      throw new BadRequestException(
        'Bitte geben Sie eine E-Mail für den Kundenzugang an.',
      );
    }

    const guessedName = this.splitName(customer.name);
    const firstName = dto.firstName?.trim() || guessedName.firstName || null;
    const lastName = dto.lastName?.trim() || guessedName.lastName || null;

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing && existing.tenantId !== tenantId) {
      throw new BadRequestException(
        'Diese E-Mail wird bereits in einem anderen Workspace verwendet.',
      );
    }

    if (existing && existing.role !== UserRole.CUSTOMER) {
      throw new BadRequestException(
        'Diese E-Mail gehört bereits zu einem internen Arcto-Benutzer.',
      );
    }

    if (
      existing &&
      existing.customerId &&
      existing.customerId !== customer.id
    ) {
      throw new BadRequestException(
        'Diese E-Mail ist bereits einem anderen Kunden zugewiesen.',
      );
    }

    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            tenantId,
            customerId: customer.id,
            role: UserRole.CUSTOMER,
            passwordHash,
            firstName,
            lastName,
          },
        })
      : await this.prisma.user.create({
          data: {
            tenantId,
            customerId: customer.id,
            email,
            passwordHash,
            firstName,
            lastName,
            role: UserRole.CUSTOMER,
          },
        });

    let inviteEmailSent = false;
    let inviteEmailError: string | undefined;

    try {
      await this.sendCustomerPortalInviteEmail({
        to: email,
        firstName,
        lastName,
        customerName: customer.name,
        password: temporaryPassword,
        tenantId,
      });
      inviteEmailSent = true;
    } catch (error) {
      inviteEmailError =
        error instanceof Error
          ? error.message
          : 'Einladungs-E-Mail konnte nicht gesendet werden.';
      this.logger.warn(
        `Kundeneinladung konnte nicht per E-Mail gesendet werden: ${inviteEmailError}`,
      );
    }

    return {
      user: this.toSanitizedUser(user),
      temporaryPassword,
      inviteEmailSent,
      inviteEmailError,
    };
  }

  async findCustomer(id: string): Promise<CustomerResponse> {
    const tenantId = this.requireTenantId();
    const customer = await this.prisma.customer.findUnique({
      where: { id, tenantId },
      include: {
        contacts: { orderBy: { createdAt: 'asc' } },
        vehicles: { orderBy: { createdAt: 'desc' } },
        serviceOrders: { orderBy: { createdAt: 'desc' } },
        _count: {
          select: { portalUsers: true },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Kunde nicht gefunden');
    }

    return this.toResponse(customer);
  }

  async deleteCustomer(id: string): Promise<void> {
    const tenantId = this.requireTenantId();
    await this.prisma.customer.delete({ where: { id, tenantId } });
  }

  async createServiceOrder(
    customerId: string,
    dto: CreateServiceOrderDto,
  ): Promise<ServiceOrderResponse> {
    const tenantId = this.requireTenantId();
    await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId, tenantId },
      select: { id: true },
    });

    if (dto.vehicleId) {
      await this.prisma.vehicle.findFirstOrThrow({
        where: { id: dto.vehicleId, tenantId },
        select: { id: true },
      });
    }

    const status = dto.status ?? ServiceOrderStatus.PLANNED;
    const serviceOrder = await this.prisma.serviceOrder.create({
      data: {
        tenantId,
        customerId,
        vehicleId: dto.vehicleId,
        title: dto.title.trim(),
        concern: dto.concern?.trim() || undefined,
        status,
        advisorName: dto.advisorName?.trim() || undefined,
        technicianName: dto.technicianName?.trim() || undefined,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
        odometerKm: dto.odometerKm,
        estimateCents: dto.estimateCents,
        totalCents: dto.totalCents,
        notes: dto.notes?.trim() || undefined,
      },
    });

    return this.mapServiceOrder(serviceOrder);
  }

  async importCustomersFromCsv(buffer: Buffer): Promise<CustomerImportResult> {
    const content = buffer.toString('utf-8').trim();
    if (!content) {
      throw new BadRequestException('CSV-Datei ist leer.');
    }

    const records = this.parseCsv(content);
    if (!records.length) {
      throw new BadRequestException('Keine Daten in der CSV-Datei gefunden.');
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, record] of records.entries()) {
      const lineNumber = index + 2;
      const name = this.getFromRecord(record, ['name', 'kunde', 'customer']);
      if (!name) {
        skipped += 1;
        errors.push(`Zeile ${lineNumber}: Kein Kundenname.`);
        continue;
      }

      try {
        const type = this.parseCustomerType(
          this.getFromRecord(record, ['type', 'kundentyp']),
        );
        const email = this.getFromRecord(record, ['email', 'kontakt']);
        const phone = this.getFromRecord(record, ['phone', 'telefon']);
        const street = this.getFromRecord(record, ['street', 'adresse']);
        const city = this.getFromRecord(record, ['city', 'ort']);
        const postalCode = this.getFromRecord(record, ['zip', 'plz']);
        const licensePlate = this.getFromRecord(record, [
          'licenseplate',
          'kennzeichen',
        ]);

        await this.prisma.customer.create({
          data: {
            tenantId: this.requireTenantId(),
            name: name.trim(),
            type,
            email: email || undefined,
            phone: phone || undefined,
            street: street || undefined,
            city: city || undefined,
            postalCode: postalCode || undefined,
            vehicles: licensePlate
              ? {
                  create: [
                    this.toVehicleCreate(
                      { licensePlate },
                      this.requireTenantId(),
                    ),
                  ],
                }
              : undefined,
          },
        });

        imported += 1;
      } catch (err) {
        skipped += 1;
        const message =
          err instanceof Error ? err.message : 'Unbekannter Fehler';
        errors.push(`Zeile ${lineNumber}: ${message}`);
      }
    }

    return { imported, skipped, errors };
  }

  private buildStats(customers: CustomerWithRelations[]) {
    const total = customers.length;
    const privateCustomers = customers.filter(
      (customer) => customer.type === CustomerType.PRIVATE,
    ).length;
    const businessCustomers = customers.filter(
      (customer) => customer.type === CustomerType.BUSINESS,
    ).length;
    const fleetCustomers = customers.filter(
      (customer) => customer.type === CustomerType.FLEET,
    ).length;
    const vehicles = customers.reduce(
      (sum, customer) => sum + customer.vehicles.length,
      0,
    );
    const openServiceOrders = customers.reduce(
      (sum, customer) =>
        sum +
        customer.serviceOrders.filter(
          (order) =>
            order.status === ServiceOrderStatus.PLANNED ||
            order.status === ServiceOrderStatus.IN_SERVICE,
        ).length,
      0,
    );

    return {
      total,
      privateCustomers,
      businessCustomers,
      fleetCustomers,
      openServiceOrders,
      vehicles,
    };
  }

  private toResponse(customer: CustomerWithRelations): CustomerResponse {
    return {
      id: customer.id,
      name: customer.name,
      type: customer.type,
      customerPackage: customer.customerPackage,
      packageServices: this.coercePackageServices(
        customer.packageServices,
        customer.customerPackage,
      ),
      portalAccessEnabled: customer._count.portalUsers > 0,
      email: customer.email,
      phone: customer.phone,
      mobile: customer.mobile,
      street: customer.street,
      postalCode: customer.postalCode,
      city: customer.city,
      preferredChannel: customer.preferredChannel,
      marketingOptIn: customer.marketingOptIn,
      notes: customer.notes,
      tags: this.coerceTags(customer.tags),
      totalSpendCents: customer.totalSpendCents,
      lastContactAt: customer.lastContactAt?.toISOString() ?? null,
      contacts: customer.contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        role: contact.role,
        channel: contact.channel,
        email: contact.email,
        phone: contact.phone,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
      })),
      vehicles: customer.vehicles.map((vehicle) => this.mapVehicle(vehicle)),
      serviceOrders: customer.serviceOrders.map((order) =>
        this.mapServiceOrder(order),
      ),
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }

  private mapVehicle(vehicle: VehicleEntity): VehicleResponse {
    return {
      id: vehicle.id,
      manufacturer: vehicle.manufacturer,
      model: vehicle.model,
      trim: vehicle.trim,
      licensePlate: vehicle.licensePlate,
      vin: vehicle.vin,
      year: vehicle.year,
      mileageKm: vehicle.mileageKm,
      fuelType: vehicle.fuelType ?? null,
      transmission: vehicle.transmission ?? null,
      color: vehicle.color,
      lastServiceAt: vehicle.lastServiceAt
        ? vehicle.lastServiceAt.toISOString()
        : null,
      nextServiceAt: vehicle.nextServiceAt
        ? vehicle.nextServiceAt.toISOString()
        : null,
      notes: vehicle.notes,
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
    };
  }

  private mapServiceOrder(order: ServiceOrderEntity): ServiceOrderResponse {
    return {
      id: order.id,
      vehicleId: order.vehicleId,
      title: order.title,
      concern: order.concern,
      status: order.status,
      advisorName: order.advisorName,
      technicianName: order.technicianName,
      scheduledAt: order.scheduledAt ? order.scheduledAt.toISOString() : null,
      completedAt: order.completedAt ? order.completedAt.toISOString() : null,
      odometerKm: order.odometerKm,
      estimateCents: order.estimateCents,
      totalCents: order.totalCents,
      notes: order.notes,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private coerceTags(tags: Prisma.JsonValue | null | undefined): string[] {
    if (!Array.isArray(tags)) {
      return [];
    }
    return tags.filter((tag): tag is string => typeof tag === 'string');
  }

  private coercePackageServices(
    value: Prisma.JsonValue | null | undefined,
    customerPackage: CustomerPackage,
  ): CustomerPackageServiceResponse[] {
    if (!Array.isArray(value)) {
      return this.defaultPackageServices(customerPackage);
    }

    const normalized = value
      .map((entry): CustomerPackageServiceResponse | null => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }
        const row = entry as Record<string, unknown>;
        const id =
          typeof row.id === 'string' && row.id.trim()
            ? row.id.trim()
            : randomUUID();
        const title = typeof row.title === 'string' ? row.title.trim() : '';
        const description =
          typeof row.description === 'string' ? row.description.trim() : '';
        if (!title) {
          return null;
        }
        return {
          id,
          title: title.slice(0, 120),
          description: description ? description.slice(0, 500) : null,
        };
      })
      .filter(
        (entry): entry is CustomerPackageServiceResponse => entry !== null,
      );

    return normalized;
  }

  private normalizePackageServices(
    services: Array<{
      id?: string;
      title?: string;
      description?: string | null;
    }>,
  ): Prisma.JsonArray {
    return services
      .map((service) => {
        const title = service.title?.trim();
        if (!title) {
          return null;
        }
        const description = service.description?.trim() || null;
        const id = service.id?.trim() || randomUUID();
        const normalized: Prisma.JsonObject = {
          id,
          title: title.slice(0, 120),
          description: description ? description.slice(0, 500) : null,
        };
        return normalized;
      })
      .filter((entry): entry is Prisma.JsonObject => Boolean(entry));
  }

  private defaultPackageServices(
    customerPackage: CustomerPackage,
  ): CustomerPackageServiceResponse[] {
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
      description: service.description || null,
    }));
  }

  private requireTenantId(): string {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant-Kontext fehlt.');
    }
    return tenantId;
  }

  private ensureCanInvitePortalUsers() {
    const role = this.context.getRole();
    if (!role || role === UserRole.VIEWER || role === UserRole.CUSTOMER) {
      throw new ForbiddenException(
        'Sie haben keine Berechtigung, Kundenzugänge einzuladen.',
      );
    }
  }

  private splitName(value?: string | null) {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
      return { firstName: '', lastName: '' };
    }
    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '' };
    }
    return {
      firstName: parts[0] ?? '',
      lastName: parts.slice(1).join(' '),
    };
  }

  private generateTemporaryPassword() {
    return randomBytes(9)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 12);
  }

  private getPortalLoginUrl() {
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    return `${appUrl.replace(/\/$/, '')}/login`;
  }

  private toSanitizedUser(user: User): SanitizedUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      customerId: user.customerId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      jobTitle: user.jobTitle,
      headline: user.headline,
      phone: user.phone,
      location: user.location,
      pronouns: user.pronouns,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      linkedinUrl: user.linkedinUrl,
      twitterUrl: user.twitterUrl,
      calendlyUrl: user.calendlyUrl,
      role: user.role,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  private async sendCustomerPortalInviteEmail(input: {
    to: string;
    firstName?: string | null;
    lastName?: string | null;
    customerName: string;
    password: string;
    tenantId: string;
  }) {
    const smtp =
      (await this.settingsService.getSmtpCredentials()) ??
      (await this.settingsService.getContactFormSmtpCredentials(
        input.tenantId,
      ));

    if (!smtp && !this.emailService.hasSmtpTransport()) {
      throw new Error(
        'SMTP ist nicht konfiguriert. Bitte hinterlegen Sie SMTP in den Einstellungen.',
      );
    }

    const workspace = await this.prisma.workspaceProfile.findUnique({
      where: { tenantId: input.tenantId },
      select: { companyName: true, legalName: true },
    });
    const brandName =
      workspace?.companyName?.trim() ||
      workspace?.legalName?.trim() ||
      'Alzag Consulting';

    const name = [input.firstName, input.lastName]
      .map((entry) => entry?.trim())
      .filter((entry): entry is string => Boolean(entry && entry.length))
      .join(' ');
    const greeting = name ? `Hallo ${name},` : 'Hallo,';
    const loginUrl = this.getPortalLoginUrl();
    const subject = `${brandName} | Ihr Kundenzugang`;

    const text = [
      greeting,
      '',
      `Sie wurden für den Kundenbereich von ${brandName} freigeschaltet.`,
      `Kunde: ${input.customerName}`,
      '',
      `Login: ${loginUrl}`,
      `E-Mail: ${input.to}`,
      `Passwort: ${input.password}`,
      '',
      'Bitte melden Sie sich an und ändern Sie Ihr Passwort nach dem ersten Login.',
      '',
      `Viele Grüße`,
      `${brandName}`,
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px;background:#070b16;color:#e5e7eb;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;border:1px solid #263045;border-radius:18px;background:#0f172a;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 12px 28px;">
              <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#d4af37;">Kundenzugang</p>
              <h1 style="margin:0;font-size:24px;line-height:1.25;color:#ffffff;">Willkommen im Kundenbereich</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px 28px;">
              <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#e5e7eb;">${greeting}</p>
              <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#cbd5e1;">Sie wurden für den Kundenbereich von <strong>${brandName}</strong> freigeschaltet.</p>
              <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#cbd5e1;"><strong>Kunde:</strong> ${input.customerName}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #334155;border-radius:14px;background:#0b1220;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 8px 0;font-size:14px;color:#e2e8f0;"><strong>Login:</strong> <a href="${loginUrl}" style="color:#d4af37;text-decoration:none;">${loginUrl}</a></p>
                    <p style="margin:0 0 8px 0;font-size:14px;color:#e2e8f0;"><strong>E-Mail:</strong> ${input.to}</p>
                    <p style="margin:0;font-size:14px;color:#e2e8f0;"><strong>Passwort:</strong> ${input.password}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0 0;font-size:13px;line-height:1.6;color:#94a3b8;">Bitte ändern Sie Ihr Passwort nach dem ersten Login aus Sicherheitsgründen.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await this.emailService.sendEmail(
      {
        to: input.to,
        subject,
        text,
        html,
        from:
          smtp?.fromEmail && smtp.fromName
            ? `${smtp.fromName} <${smtp.fromEmail}>`
            : (smtp?.fromEmail ??
              (this.emailService.getDefaultSender()
                ? `${brandName} <${this.emailService.getDefaultSender()}>`
                : undefined)),
      },
      smtp ?? undefined,
    );
  }

  private toContactCreate(contact: CreateCustomerContactDto) {
    return {
      name: contact.name.trim(),
      role: contact.role?.trim() || undefined,
      channel: contact.channel?.trim() || undefined,
      email: contact.email?.trim() || undefined,
      phone: contact.phone?.trim() || undefined,
    };
  }

  private toVehicleCreate(vehicle: CreateVehicleDto, tenantId: string) {
    return {
      tenantId,
      manufacturer: vehicle.manufacturer?.trim() || undefined,
      model: vehicle.model?.trim() || undefined,
      trim: vehicle.trim?.trim() || undefined,
      licensePlate: vehicle.licensePlate?.trim() || undefined,
      vin: vehicle.vin?.trim() || undefined,
      year: vehicle.year,
      mileageKm: vehicle.mileageKm,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      color: vehicle.color?.trim() || undefined,
      lastServiceAt: vehicle.lastServiceAt
        ? new Date(vehicle.lastServiceAt)
        : undefined,
      nextServiceAt: vehicle.nextServiceAt
        ? new Date(vehicle.nextServiceAt)
        : undefined,
      notes: vehicle.notes?.trim() || undefined,
    };
  }

  private async upsertPrimaryContact(
    customerId: string,
    contact?: UpdateCustomerContactDto,
  ) {
    if (!contact) return;

    const hasInput =
      contact.name !== undefined ||
      contact.role !== undefined ||
      contact.channel !== undefined ||
      contact.email !== undefined ||
      contact.phone !== undefined;

    if (!hasInput) return;

    if (contact.id) {
      await this.prisma.customerContact.update({
        where: { id: contact.id, customerId },
        data: {
          name: contact.name?.trim() || undefined,
          role: contact.role?.trim() || null,
          channel: contact.channel?.trim() || null,
          email: contact.email?.trim() || null,
          phone: contact.phone?.trim() || null,
        },
      });
      return;
    }

    await this.prisma.customerContact.create({
      data: {
        customerId,
        name:
          contact.name?.trim() ||
          contact.email?.trim() ||
          contact.phone?.trim() ||
          'Kontakt',
        role: contact.role?.trim() || null,
        channel: contact.channel?.trim() || null,
        email: contact.email?.trim() || null,
        phone: contact.phone?.trim() || null,
      },
    });
  }

  private parseCsv(content: string) {
    const [headerLine, ...rows] = content.split(/\r?\n/);
    const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());
    return rows
      .map((line) => {
        const values = line.split(',');
        if (!values.some((value) => value.trim().length > 0)) {
          return null;
        }
        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
          record[header] = values[index]?.trim() ?? '';
        });
        return record;
      })
      .filter((record): record is Record<string, string> => record !== null);
  }

  private getFromRecord(record: Record<string, string>, candidates: string[]) {
    for (const key of candidates) {
      if (record[key]) {
        return record[key];
      }
    }
    return '';
  }

  private parseCustomerType(value?: string) {
    const normalized = value?.toLowerCase() ?? '';
    switch (normalized) {
      case 'business':
      case 'firma':
      case 'gewerbe':
        return CustomerType.BUSINESS;
      case 'fleet':
      case 'flotte':
        return CustomerType.FLEET;
      default:
        return CustomerType.PRIVATE;
    }
  }
}
