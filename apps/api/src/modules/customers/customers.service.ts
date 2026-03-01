import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerType,
  Prisma,
  ServiceOrderStatus,
  VehicleFuelType,
  VehicleTransmission,
  CustomerContact,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import {
  CreateCustomerDto,
  CreateCustomerContactDto,
  CreateVehicleDto,
} from './dto/create-customer.dto';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
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

export interface CustomerResponse {
  id: string;
  name: string;
  type: CustomerType;
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

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
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

    const customer = await this.prisma.customer.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        type: dto.type,
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

  async findCustomer(id: string): Promise<CustomerResponse> {
    const tenantId = this.requireTenantId();
    const customer = await this.prisma.customer.findUnique({
      where: { id, tenantId },
      include: {
        contacts: { orderBy: { createdAt: 'asc' } },
        vehicles: { orderBy: { createdAt: 'desc' } },
        serviceOrders: { orderBy: { createdAt: 'desc' } },
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

  private requireTenantId(): string {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant-Kontext fehlt.');
    }
    return tenantId;
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
