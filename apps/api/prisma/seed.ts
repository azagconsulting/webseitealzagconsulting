import {
  CustomerMessageDirection,
  CustomerMessageStatus,
  CustomerType,
  PrismaClient,
  ServiceOrderStatus,
  UserRole,
  VehicleFuelType,
  VehicleTransmission,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000);

type SeedContact = {
  name: string;
  role?: string;
  channel?: string;
  email?: string;
  phone?: string;
};

type SeedVehicle = {
  manufacturer?: string;
  model?: string;
  trim?: string;
  licensePlate?: string;
  vin?: string;
  year?: number;
  mileageKm?: number;
  fuelType?: VehicleFuelType;
  transmission?: VehicleTransmission;
  color?: string;
  lastServiceAt?: Date;
  nextServiceAt?: Date;
  notes?: string;
};

type SeedServiceOrder = {
  title: string;
  concern?: string;
  status: ServiceOrderStatus;
  advisorName?: string;
  technicianName?: string;
  scheduledAt?: Date;
  completedAt?: Date;
  odometerKm?: number;
  estimateCents?: number;
  totalCents?: number;
  notes?: string;
  vehicleLicensePlate?: string;
};

type SeedMessage = {
  contact?: string;
  direction: CustomerMessageDirection;
  subject?: string;
  body: string;
  fromEmail?: string;
  toEmail?: string;
  preview?: string;
  sentAt?: Date;
  receivedAt?: Date;
  status?: CustomerMessageStatus;
};

type SeedCustomer = {
  name: string;
  type: CustomerType;
  email?: string;
  phone?: string;
  mobile?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  preferredChannel?: string;
  marketingOptIn?: boolean;
  notes?: string;
  tags?: string[];
  totalSpendCents: number;
  lastContactAt?: Date;
  contacts?: SeedContact[];
  vehicles?: SeedVehicle[];
  serviceOrders?: SeedServiceOrder[];
  messages?: SeedMessage[];
};

async function main() {
  await prisma.customerMessage.deleteMany();
  await prisma.serviceOrder.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.customerContact.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.leadUpdate.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.leadWorkflowSetting.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenantSetting.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Autohaus Herrmann',
      slug: 'autohaus-herrmann-demo',
      description: 'Demo-Tenant für Werkstatt-Setup',
    },
  });

  const demoAdminEmail = (
    process.env.DEMO_ADMIN_EMAIL || 'admin@arcto.com'
  ).trim();
  const demoAdminPassword = (
    process.env.DEMO_ADMIN_PASSWORD || 'arcto12345'
  ).trim();

  if (!demoAdminEmail || !demoAdminPassword) {
    throw new Error('DEMO_ADMIN_EMAIL oder DEMO_ADMIN_PASSWORD fehlen.');
  }

  if (demoAdminPassword.length < 8) {
    throw new Error('DEMO_ADMIN_PASSWORD muss mindestens 8 Zeichen lang sein.');
  }

  const adminPasswordHash = await bcrypt.hash(demoAdminPassword, 12);
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: demoAdminEmail.toLowerCase(),
      passwordHash: adminPasswordHash,
      firstName: 'Service',
      lastName: 'Leitung',
      role: UserRole.ADMIN,
    },
  });

  console.log('Demo-Admin angelegt:', demoAdminEmail);

  const customers: SeedCustomer[] = [
    {
      name: 'Sabine Keller',
      type: CustomerType.PRIVATE,
      email: 'sabine.keller@example.com',
      phone: '089 2123 9876',
      mobile: '0176 99887766',
      street: 'Ludwigstraße 12',
      postalCode: '80333',
      city: 'München',
      preferredChannel: 'Telefon',
      marketingOptIn: true,
      notes: 'Kommt jedes Frühjahr für Reifenwechsel & Klimacheck.',
      tags: ['Stammkunde', 'SUV'],
      totalSpendCents: 248000,
      lastContactAt: hoursAgo(6),
      contacts: [
        {
          name: 'Sabine Keller',
          channel: 'Telefon',
          email: 'sabine.keller@example.com',
          phone: '089 2123 9876',
        },
      ],
      vehicles: [
        {
          manufacturer: 'Volkswagen',
          model: 'Tiguan 2.0 TSI',
          trim: 'Highline 4Motion',
          licensePlate: 'M-AH 2043',
          vin: 'WVWZZZ5NZBW123456',
          year: 2019,
          mileageKm: 78500,
          fuelType: VehicleFuelType.GASOLINE,
          transmission: VehicleTransmission.AUTOMATIC,
          color: 'Deep Black',
          lastServiceAt: hoursAgo(720),
          nextServiceAt: new Date('2025-03-15T07:30:00.000Z'),
          notes: 'Klimaanlage riecht leicht, Verdampfer reinigen.',
        },
      ],
      serviceOrders: [
        {
          title: 'Jahresinspektion & Ölwechsel',
          concern: 'Serviceanzeige aktiv',
          status: ServiceOrderStatus.COMPLETED,
          advisorName: 'Elena Roth',
          technicianName: 'Martin Höpfner',
          scheduledAt: hoursAgo(72),
          completedAt: hoursAgo(48),
          odometerKm: 78000,
          estimateCents: 43000,
          totalCents: 45500,
          notes: 'Pollenfilter erneuert.',
          vehicleLicensePlate: 'M-AH 2043',
        },
        {
          title: 'Sommerreifen montieren',
          concern: 'Räder liegen eingelagert',
          status: ServiceOrderStatus.PLANNED,
          advisorName: 'Elena Roth',
          scheduledAt: new Date('2025-04-05T08:00:00.000Z'),
          estimateCents: 12000,
          notes: 'RDKS prüfen.',
          vehicleLicensePlate: 'M-AH 2043',
        },
      ],
      messages: [
        {
          contact: 'Sabine Keller',
          direction: CustomerMessageDirection.INBOUND,
          subject: 'Sommerreifen Wechsel',
          body: 'Hallo Herrmann Team,\nich würde gern nächste Woche die Sommerreifen montieren lassen. Habt ihr noch Termine frei?\nLiebe Grüße\nSabine',
          fromEmail: 'sabine.keller@example.com',
          toEmail: 'service@autohaus-herrmann.de',
          preview: 'Habt ihr nächste Woche Termine frei zum Reifenwechsel?',
          receivedAt: hoursAgo(5),
        },
      ],
    },
    {
      name: 'LogiTrans GmbH',
      type: CustomerType.BUSINESS,
      email: 'flotte@logitrans.de',
      phone: '040 456 9911',
      street: 'Kattrepel 5',
      postalCode: '20095',
      city: 'Hamburg',
      preferredChannel: 'E-Mail',
      marketingOptIn: false,
      notes: 'Lieferflotte mit festen Servicefenstern.',
      tags: ['Fuhrpark', 'Transport'],
      totalSpendCents: 1245000,
      lastContactAt: hoursAgo(12),
      contacts: [
        {
          name: 'Paul Richter',
          role: 'Fuhrparkleiter',
          channel: 'E-Mail',
          email: 'paul.richter@logitrans.de',
          phone: '040 456 99112',
        },
      ],
      vehicles: [
        {
          manufacturer: 'Mercedes-Benz',
          model: 'Sprinter 316 CDI',
          licensePlate: 'HH-LT 1201',
          year: 2021,
          mileageKm: 148000,
          fuelType: VehicleFuelType.DIESEL,
          transmission: VehicleTransmission.MANUAL,
          color: 'Arktisweiß',
          lastServiceAt: hoursAgo(240),
          nextServiceAt: new Date('2025-02-20T06:00:00.000Z'),
          notes: '24/7 Einsatz – hohe Laufleistung.',
        },
        {
          manufacturer: 'Mercedes-Benz',
          model: 'Sprinter 316 CDI',
          licensePlate: 'HH-LT 1288',
          year: 2022,
          mileageKm: 99000,
          fuelType: VehicleFuelType.DIESEL,
          transmission: VehicleTransmission.AUTOMATIC,
          color: 'Graphitgrau',
          lastServiceAt: hoursAgo(120),
          notes: 'Antriebswelle letztes Jahr erneuert.',
        },
      ],
      serviceOrders: [
        {
          title: 'Bremsen Vorderachse erneuern',
          concern: 'Warnmeldung Bremsbelag',
          status: ServiceOrderStatus.IN_SERVICE,
          advisorName: 'Kevin Sturm',
          technicianName: 'Diana Fuchs',
          scheduledAt: hoursAgo(12),
          odometerKm: 148200,
          estimateCents: 89000,
          notes: 'Transporter muss bis morgen 6 Uhr raus.',
          vehicleLicensePlate: 'HH-LT 1201',
        },
        {
          title: 'HU/AU Vorbereitung',
          concern: 'Termin mit TÜV Nord',
          status: ServiceOrderStatus.PLANNED,
          advisorName: 'Kevin Sturm',
          scheduledAt: new Date('2025-02-18T06:30:00.000Z'),
          estimateCents: 45000,
          vehicleLicensePlate: 'HH-LT 1288',
        },
      ],
      messages: [
        {
          contact: 'Paul Richter',
          direction: CustomerMessageDirection.INBOUND,
          subject: 'Sprinter 1201 steht',
          body: 'Moin Herrmann Team,\nder 1201 meldet seit heute Früh Bremsfehler und steht bei euch auf dem Hof. Könnt ihr ihn bevorzugt behandeln? Fahrer wartet.\nDanke, Paul',
          fromEmail: 'paul.richter@logitrans.de',
          toEmail: 'service@autohaus-herrmann.de',
          preview: 'Sprinter 1201 steht wegen Bremswarnung.',
          receivedAt: hoursAgo(11),
        },
        {
          contact: 'Paul Richter',
          direction: CustomerMessageDirection.OUTBOUND,
          subject: 'Bremsensatz verbaut',
          body: 'Hallo Paul,\nder neue Bremsensatz ist montiert, wir testen gerade. Wenn alles passt, geht der Wagen heute 17 Uhr raus.\nGruß\nKevin',
          fromEmail: 'kevin@autohaus-herrmann.de',
          toEmail: 'paul.richter@logitrans.de',
          preview: 'Bremsensatz montiert, Probefahrt läuft.',
          sentAt: hoursAgo(2),
        },
      ],
    },
    {
      name: 'CityRide Taxi KG',
      type: CustomerType.FLEET,
      email: 'leitstelle@cityride-taxi.de',
      phone: '0711 789 220',
      street: 'Neckarstraße 44',
      postalCode: '70190',
      city: 'Stuttgart',
      preferredChannel: 'Telefon',
      marketingOptIn: true,
      notes: 'Taxi-Betrieb mit Hybrid-Flotte.',
      tags: ['Taxi', 'Hybrid'],
      totalSpendCents: 732000,
      lastContactAt: hoursAgo(30),
      contacts: [
        {
          name: 'Leyla Osman',
          role: 'Disposition',
          channel: 'Telefon',
          email: 'leyla.osman@cityride-taxi.de',
          phone: '0711 789 220',
        },
      ],
      vehicles: [
        {
          manufacturer: 'Toyota',
          model: 'Prius+',
          licensePlate: 'S-CR 2231',
          year: 2020,
          mileageKm: 210000,
          fuelType: VehicleFuelType.HYBRID,
          transmission: VehicleTransmission.AUTOMATIC,
          color: 'Perlweiß',
          lastServiceAt: hoursAgo(336),
          nextServiceAt: new Date('2025-02-25T05:30:00.000Z'),
          notes: 'Fahrbatterie Monitoring auffällig.',
        },
        {
          manufacturer: 'Toyota',
          model: 'Prius+',
          licensePlate: 'S-CR 2240',
          year: 2021,
          mileageKm: 178000,
          fuelType: VehicleFuelType.HYBRID,
          transmission: VehicleTransmission.AUTOMATIC,
          color: 'Taxi-Beige',
          lastServiceAt: hoursAgo(200),
          notes: 'Innenraum stark beansprucht.',
        },
      ],
      serviceOrders: [
        {
          title: 'Hybrid-System Diagnose',
          concern: 'Warnung „Check Hybrid System"',
          status: ServiceOrderStatus.PLANNED,
          advisorName: 'Nora Weiß',
          scheduledAt: new Date('2025-02-12T05:30:00.000Z'),
          estimateCents: 68000,
          notes: 'Batteriekühlung reinigen.',
          vehicleLicensePlate: 'S-CR 2231',
        },
        {
          title: 'Innenraumreinigung Business',
          status: ServiceOrderStatus.COMPLETED,
          advisorName: 'Nora Weiß',
          technicianName: 'Team Aufbereitung',
          scheduledAt: hoursAgo(96),
          completedAt: hoursAgo(72),
          totalCents: 22000,
          notes: 'Lederpflege durchgeführt.',
          vehicleLicensePlate: 'S-CR 2240',
        },
      ],
      messages: [
        {
          contact: 'Leyla Osman',
          direction: CustomerMessageDirection.INBOUND,
          subject: 'Hybrid-Warnung',
          body: 'Hi Nora,\nder Prius 2231 meldet wieder „Check Hybrid System". Können wir Mittwoch früh vorbeikommen? Fahrer Yilmaz bringt ihn.',
          fromEmail: 'leyla.osman@cityride-taxi.de',
          toEmail: 'service@autohaus-herrmann.de',
          preview: 'Prius 2231 meldet erneut „Check Hybrid System".',
          receivedAt: hoursAgo(30),
        },
      ],
    },
  ];

  for (const entry of customers) {
    const customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: entry.name,
        type: entry.type,
        email: entry.email,
        phone: entry.phone,
        mobile: entry.mobile,
        street: entry.street,
        postalCode: entry.postalCode,
        city: entry.city,
        preferredChannel: entry.preferredChannel,
        marketingOptIn: entry.marketingOptIn ?? false,
        notes: entry.notes,
        tags: entry.tags ?? [],
        totalSpendCents: entry.totalSpendCents,
        lastContactAt: entry.lastContactAt,
        contacts: entry.contacts?.length
          ? {
              create: entry.contacts,
            }
          : undefined,
      },
      include: {
        contacts: true,
      },
    });

    const vehicleIndex = new Map<string, string>();
    for (const vehicle of entry.vehicles ?? []) {
      const createdVehicle = await prisma.vehicle.create({
        data: {
          tenantId: tenant.id,
          customerId: customer.id,
          manufacturer: vehicle.manufacturer,
          model: vehicle.model,
          trim: vehicle.trim,
          licensePlate: vehicle.licensePlate,
          vin: vehicle.vin,
          year: vehicle.year,
          mileageKm: vehicle.mileageKm,
          fuelType: vehicle.fuelType,
          transmission: vehicle.transmission,
          color: vehicle.color,
          lastServiceAt: vehicle.lastServiceAt,
          nextServiceAt: vehicle.nextServiceAt,
          notes: vehicle.notes,
        },
      });

      if (vehicle.licensePlate) {
        vehicleIndex.set(vehicle.licensePlate.trim().toLowerCase(), createdVehicle.id);
      }
      if (vehicle.vin) {
        vehicleIndex.set(vehicle.vin.trim().toLowerCase(), createdVehicle.id);
      }
    }

    for (const order of entry.serviceOrders ?? []) {
      const vehicleId = order.vehicleLicensePlate
        ? vehicleIndex.get(order.vehicleLicensePlate.trim().toLowerCase())
        : undefined;
      await prisma.serviceOrder.create({
        data: {
          tenantId: tenant.id,
          customerId: customer.id,
          vehicleId,
          title: order.title,
          concern: order.concern,
          status: order.status,
          advisorName: order.advisorName,
          technicianName: order.technicianName,
          scheduledAt: order.scheduledAt,
          completedAt: order.completedAt,
          odometerKm: order.odometerKm,
          estimateCents: order.estimateCents,
          totalCents: order.totalCents,
          notes: order.notes,
        },
      });
    }

    for (const message of entry.messages ?? []) {
      const contact = message.contact
        ? customer.contacts.find((item) => item.name === message.contact)
        : null;

      await prisma.customerMessage.create({
        data: {
          tenantId: tenant.id,
          customerId: customer.id,
          contactId: contact?.id,
          direction: message.direction,
          status: message.status ?? CustomerMessageStatus.SENT,
          subject: message.subject,
          preview: message.preview,
          body: message.body,
          fromEmail: message.fromEmail,
          toEmail: message.toEmail ?? contact?.email,
          sentAt: message.sentAt,
          receivedAt: message.receivedAt,
        },
      });
    }
  }

  console.log('Werkstatt-Demo-Kunden angelegt:', customers.length);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
