import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, TrackingEventType, TrafficSource } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import { CreateTrackingEventDto } from './dto/create-tracking-event.dto';

type PageAccumulator = {
  path: string;
  views: number;
  organicViews: number;
  directViews: number;
  clicks: number;
  durationTotalMs: number;
  durationSamples: number;
  uniqueSessions: Set<string>;
};

type DailyBucket = {
  views: number;
  organic: number;
  direct: number;
  clicks: number;
  uniqueSessions: Set<string>;
};

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async recordEvent(dto: CreateTrackingEventDto) {
    const tenantId = await this.getTrackingTenantId();
    const now = new Date();
    const path = this.normalizePath(dto.path);
    const sessionKey = dto.sessionId.trim();
    const referrer = this.truncate(dto.referrer, 512);
    const utmSource = this.normalizeTag(dto.utmSource);
    const utmMedium = this.normalizeTag(dto.utmMedium);

    const existingSession = await this.prisma.trackingSession.findUnique({
      where: { tenantId_sessionKey: { tenantId, sessionKey } },
    });

    const nextSource = this.inferTrafficSource(
      referrer ?? existingSession?.referrer ?? undefined,
      utmMedium ?? existingSession?.utmMedium ?? undefined,
      utmSource ?? existingSession?.utmSource ?? undefined,
      existingSession?.trafficSource,
    );

    let sessionId: string;

    if (existingSession) {
      const updateData: Prisma.TrackingSessionUpdateInput = {
        lastSeenAt: now,
      };

      if (!existingSession.firstPage) {
        updateData.firstPage = path;
      }
      if (!existingSession.referrer && referrer) {
        updateData.referrer = referrer;
      }
      if (!existingSession.utmSource && utmSource) {
        updateData.utmSource = utmSource;
      }
      if (!existingSession.utmMedium && utmMedium) {
        updateData.utmMedium = utmMedium;
      }
      if (nextSource && nextSource !== existingSession.trafficSource) {
        updateData.trafficSource = nextSource;
      }

      await this.prisma.trackingSession.update({
        where: { tenantId_sessionKey: { tenantId, sessionKey } },
        data: updateData,
      });
      sessionId = existingSession.id;
    } else {
      const session = await this.prisma.trackingSession.create({
        data: {
          tenantId,
          sessionKey,
          trafficSource: nextSource ?? TrafficSource.DIRECT,
          referrer,
          utmSource,
          utmMedium,
          firstPage: path,
          startedAt: now,
          lastSeenAt: now,
        },
      });
      sessionId = session.id;
    }

    const durationMs =
      dto.durationMs === undefined || dto.durationMs === null
        ? null
        : Math.min(Math.max(Math.floor(dto.durationMs), 0), 1000 * 60 * 60 * 4);

    await this.prisma.trackingEvent.create({
      data: {
        tenantId,
        sessionId,
        type: dto.type,
        path,
        label: this.truncate(dto.label, 255),
        durationMs: durationMs ?? null,
      },
    });

    return { success: true };
  }

  async getSummary(days: number, from?: string, to?: string) {
    const tenantId = await this.getTrackingTenantId();
    const { since, until } = this.resolveRange(days, from, to);

    const events = await this.prisma.trackingEvent.findMany({
      where: { tenantId, createdAt: { gte: since, lte: until } },
      orderBy: { createdAt: 'asc' },
      select: {
        type: true,
        path: true,
        durationMs: true,
        createdAt: true,
        sessionId: true,
        session: { select: { trafficSource: true } },
      },
    });

    const uniqueSessions = new Set<string>();
    const pageMap = new Map<string, PageAccumulator>();
    const dailyBuckets = this.createDailyBuckets(since, until);

    let totalViews = 0;
    let totalClicks = 0;
    let totalOrganic = 0;
    let durationSum = 0;
    let durationSamples = 0;

    for (const event of events) {
      const dateKey = this.toDateKey(event.createdAt);
      const bucket = dailyBuckets.get(dateKey) ?? this.createEmptyBucket();
      if (!dailyBuckets.has(dateKey)) {
        dailyBuckets.set(dateKey, bucket);
      }

      const traffic = event.session?.trafficSource ?? TrafficSource.DIRECT;
      uniqueSessions.add(event.sessionId);
      bucket.uniqueSessions.add(event.sessionId);

      const page =
        pageMap.get(event.path) ?? this.createPageAccumulator(event.path);
      page.uniqueSessions.add(event.sessionId);

      if (event.type === TrackingEventType.PAGE_VIEW) {
        totalViews += 1;
        bucket.views += 1;
        page.views += 1;
        if (traffic === TrafficSource.ORGANIC) {
          totalOrganic += 1;
          bucket.organic += 1;
          page.organicViews += 1;
        } else if (traffic === TrafficSource.DIRECT) {
          bucket.direct += 1;
          page.directViews += 1;
        }
      }

      if (event.type === TrackingEventType.CLICK) {
        totalClicks += 1;
        bucket.clicks += 1;
        page.clicks += 1;
      }

      if (
        event.type === TrackingEventType.PAGE_EXIT &&
        typeof event.durationMs === 'number'
      ) {
        const value = Math.max(0, event.durationMs);
        durationSum += value;
        durationSamples += 1;
        page.durationTotalMs += value;
        page.durationSamples += 1;
      }

      pageMap.set(event.path, page);
    }

    const timeseries = Array.from(dailyBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bucket]) => ({
        date,
        views: bucket.views,
        organic: bucket.organic,
        direct: bucket.direct,
        clicks: bucket.clicks,
        uniqueVisitors: bucket.uniqueSessions.size,
      }));

    const pages = Array.from(pageMap.values())
      .map((page) => ({
        path: page.path,
        views: page.views,
        uniqueVisitors: page.uniqueSessions.size,
        clicks: page.clicks,
        clickRate: page.views ? page.clicks / page.views : 0,
        avgDurationMs: page.durationSamples
          ? page.durationTotalMs / page.durationSamples
          : 0,
        organicViews: page.organicViews,
        directViews: page.directViews,
      }))
      .sort((a, b) => b.views - a.views || b.clicks - a.clicks);

    return {
      since: since.toISOString(),
      until: until.toISOString(),
      totals: {
        views: totalViews,
        uniqueVisitors: uniqueSessions.size,
        clicks: totalClicks,
        organicShare: totalViews ? totalOrganic / totalViews : 0,
        avgDurationMs: durationSamples ? durationSum / durationSamples : 0,
      },
      pages,
      timeseries,
    };
  }

  private async getTrackingTenantId() {
    // Gemeinsames Tracking für alle Accounts: nutze den ersten verfügbaren Tenant als Sammel-Tenant.
    const defaultTenant = await this.getDefaultTenantId();
    if (defaultTenant) {
      return defaultTenant;
    }
    const contextTenant = this.context.getTenantId();
    if (!contextTenant) {
      throw new BadRequestException('Tenant-Kontext fehlt für Tracking.');
    }
    return contextTenant;
  }

  private async getDefaultTenantId() {
    const tenant = await this.prisma.tenant.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return tenant?.id;
  }

  private resolveRange(days: number, from?: string, to?: string) {
    const end = this.endOfDay(to ? new Date(to) : new Date());
    const maxDays = 90;

    let start: Date | null = null;
    if (from) {
      const parsed = this.startOfDay(new Date(from));
      if (!Number.isNaN(parsed.getTime())) {
        start = parsed;
      }
    }

    if (!start) {
      const windowDays = this.clampDays(days);
      start = this.startOfDay(
        new Date(end.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000),
      );
    }

    const spanDays =
      Math.floor(
        (this.startOfDay(end).getTime() - this.startOfDay(start).getTime()) /
          (24 * 60 * 60 * 1000),
      ) + 1;

    if (spanDays > maxDays) {
      const adjustedStart = this.startOfDay(
        new Date(end.getTime() - (maxDays - 1) * 24 * 60 * 60 * 1000),
      );
      return { since: adjustedStart, until: end };
    }

    return { since: start, until: end };
  }

  private clampDays(value: number) {
    const numeric = Number.isFinite(value) ? Number(value) : 14;
    return Math.min(Math.max(Math.floor(numeric), 1), 90);
  }

  private startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private endOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
  }

  private toDateKey(date: Date) {
    return this.startOfDay(date).toISOString().split('T')[0];
  }

  private createDailyBuckets(since: Date, until: Date) {
    const map = new Map<string, DailyBucket>();
    const cursor = this.startOfDay(since);
    const end = this.startOfDay(until);
    while (cursor.getTime() <= end.getTime()) {
      map.set(this.toDateKey(cursor), this.createEmptyBucket());
      cursor.setDate(cursor.getDate() + 1);
    }
    return map;
  }

  private createEmptyBucket(): DailyBucket {
    return {
      views: 0,
      organic: 0,
      direct: 0,
      clicks: 0,
      uniqueSessions: new Set<string>(),
    };
  }

  private createPageAccumulator(path: string): PageAccumulator {
    return {
      path,
      views: 0,
      organicViews: 0,
      directViews: 0,
      clicks: 0,
      durationTotalMs: 0,
      durationSamples: 0,
      uniqueSessions: new Set<string>(),
    };
  }

  private normalizePath(path: string) {
    const trimmed = path?.trim() || '/';
    try {
      const url = new URL(trimmed, 'https://arcto.local');
      return url.pathname || '/';
    } catch {
      const cleaned = trimmed.split(/[?#]/)[0] || '/';
      return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
    }
  }

  private truncate(value: string | undefined | null, max = 255) {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
  }

  private normalizeTag(value?: string | null) {
    if (!value) return undefined;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    return normalized.slice(0, 120);
  }

  private inferTrafficSource(
    referrer?: string,
    utmMedium?: string,
    utmSource?: string,
    fallback?: TrafficSource,
  ): TrafficSource | undefined {
    const medium = utmMedium?.toLowerCase();
    const source = utmSource?.toLowerCase();
    if (medium === 'organic' || source === 'organic') {
      return TrafficSource.ORGANIC;
    }
    if (referrer) {
      const host = this.safeHost(referrer);
      if (host && /localhost|127\.0\.0\.1|arcto|github\.dev/i.test(host)) {
        return TrafficSource.DIRECT;
      }
      if (
        host &&
        /google\.|bing\.|yahoo\.|duckduckgo\.|ecosia\.|baidu\.|yandex\./i.test(
          host,
        )
      ) {
        return TrafficSource.ORGANIC;
      }
      return TrafficSource.REFERRAL;
    }
    if (source) {
      if (source.includes('google') || source.includes('bing')) {
        return TrafficSource.ORGANIC;
      }
      return TrafficSource.REFERRAL;
    }
    return fallback ?? TrafficSource.DIRECT;
  }

  private safeHost(referrer: string) {
    try {
      const url = new URL(referrer);
      return url.host;
    } catch (error) {
      this.logger.debug(
        `Referrer konnte nicht geparst werden: ${
          (error as Error)?.message ?? error
        }`,
      );
      return null;
    }
  }
}
