import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { Readable } from 'stream';
import fetch, { Response } from 'node-fetch';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '@/config/app.config';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { RequestContextService } from '@/infra/request-context/request-context.service';

import type {
  GoogleDriveFileListResponse,
  GoogleDriveFileResponse,
  GoogleDriveSharedDrive,
  GoogleDriveStatusResponse,
} from './drive.types';
import { ListGoogleDriveFilesDto } from './dto/list-google-drive-files.dto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};
type GoogleTokenResponseWithAccess = Omit<
  GoogleTokenResponse,
  'access_token'
> & {
  access_token: string;
};

type GoogleUserInfo = {
  email?: string;
  name?: string;
  picture?: string;
};

type GoogleDriveFilesResponse = {
  nextPageToken?: string;
  files?: Array<{
    id?: string;
    name?: string;
    mimeType?: string;
    size?: string;
    modifiedTime?: string;
    driveId?: string;
    webViewLink?: string;
  }>;
};

type GoogleSharedDrivesResponse = {
  drives?: Array<{
    id?: string;
    name?: string;
  }>;
};

@Injectable()
export class GoogleDriveService {
  private static readonly STATE_TTL_SECONDS = 10 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly configService: ConfigService<AppConfig, true>,
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

  private getDriveConfig() {
    const googleDrive = this.configService.get('googleDrive', { infer: true });
    const appConfig = this.configService.get('app', { infer: true });
    const frontend = this.configService.get('frontend', { infer: true });
    const clientId = googleDrive.clientId;
    const clientSecret = googleDrive.clientSecret;
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Google Drive OAuth ist nicht konfiguriert.',
      );
    }

    const redirectUri =
      googleDrive.redirectUri ??
      `${appConfig.url}/api/v1/drive/google/oauth/callback`;

    return {
      clientId,
      clientSecret,
      redirectUri,
      frontendUrl: frontend.url,
      maxFileSizeMb: this.getMaxFileSizeMb(),
    };
  }

  private getMaxFileSizeMb() {
    const googleDrive = this.configService.get('googleDrive', { infer: true });
    const maxFileSizeMb = Number.isFinite(googleDrive.maxFileSizeMb)
      ? googleDrive.maxFileSizeMb
      : 25;
    return Math.max(1, Math.round(maxFileSizeMb));
  }

  private getStateSecret() {
    const auth = this.configService.get('auth', { infer: true });
    return auth.jwt.secret;
  }

  private signState(payload: {
    tenantId: string;
    userId: string;
    returnTo: string;
  }) {
    const now = Math.floor(Date.now() / 1000);
    const statePayload = {
      ...payload,
      nonce: randomBytes(12).toString('hex'),
      iat: now,
      exp: now + GoogleDriveService.STATE_TTL_SECONDS,
    };
    const encoded = Buffer.from(JSON.stringify(statePayload)).toString(
      'base64url',
    );
    const signature = createHmac('sha256', this.getStateSecret())
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  private parseState(state: string) {
    const [encoded, signature] = state.split('.');
    if (!encoded || !signature) {
      throw new BadRequestException('Ungültiger OAuth-Status.');
    }
    const expected = createHmac('sha256', this.getStateSecret())
      .update(encoded)
      .digest('base64url');
    if (signature !== expected) {
      throw new BadRequestException('Ungültiger OAuth-Status.');
    }
    let payload: {
      tenantId: string;
      userId: string;
      returnTo: string;
      exp: number;
    };
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      );
      if (!parsed || typeof parsed !== 'object') {
        throw new BadRequestException('Ungültiger OAuth-Status.');
      }
      const record = parsed as Record<string, unknown>;
      const tenantId =
        typeof record.tenantId === 'string' ? record.tenantId : null;
      const userId = typeof record.userId === 'string' ? record.userId : null;
      const returnTo =
        typeof record.returnTo === 'string' ? record.returnTo : null;
      const exp = typeof record.exp === 'number' ? record.exp : null;
      if (!tenantId || !userId || !returnTo || !exp) {
        throw new BadRequestException('Ungültiger OAuth-Status.');
      }
      payload = {
        tenantId,
        userId,
        returnTo,
        exp,
      };
    } catch {
      throw new BadRequestException('Ungültiger OAuth-Status.');
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      throw new BadRequestException('OAuth-Status ist abgelaufen.');
    }
    return payload;
  }

  private sanitizeReturnTo(value: string | null | undefined, fallback: string) {
    if (!value) return fallback;
    if (value.startsWith('/')) {
      return value;
    }
    return fallback;
  }

  private sanitizeFileName(value?: string | null) {
    if (!value) {
      return 'Google-Drive-Datei';
    }
    const cleaned = value.replace(/[\\/]/g, ' ').trim();
    return cleaned || 'Google-Drive-Datei';
  }

  private async ensureOk(response: Response, message: string) {
    if (response.ok) return;
    let details = '';
    try {
      const body = await response.text();
      details = body ? ` (${body.slice(0, 200)})` : '';
    } catch {
      details = '';
    }
    throw new BadRequestException(`${message}${details}`);
  }

  private async exchangeToken(
    body: URLSearchParams,
  ): Promise<GoogleTokenResponseWithAccess> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    await this.ensureOk(response, 'Google OAuth fehlgeschlagen.');
    const data = (await response.json()) as GoogleTokenResponse;
    if (!data.access_token) {
      throw new BadRequestException('Google OAuth fehlgeschlagen.');
    }
    return data as GoogleTokenResponseWithAccess;
  }

  private async getUserInfo(accessToken: string) {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    await this.ensureOk(
      response,
      'Google-Kontoinformationen konnten nicht geladen werden.',
    );
    return (await response.json()) as GoogleUserInfo;
  }

  private async getConnection() {
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    return this.prisma.googleDriveConnection.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
  }

  private async refreshAccessToken(refreshToken: string) {
    const { clientId, clientSecret } = this.getDriveConfig();
    const payload = new URLSearchParams();
    payload.set('client_id', clientId);
    payload.set('client_secret', clientSecret);
    payload.set('refresh_token', refreshToken);
    payload.set('grant_type', 'refresh_token');
    return this.exchangeToken(payload);
  }

  private async getValidAccessToken() {
    const connection = await this.getConnection();
    if (!connection) {
      throw new ForbiddenException('Google Drive ist nicht verbunden.');
    }

    const now = Date.now();
    const expiresAt = connection.expiresAt?.getTime() ?? null;
    const isExpired = expiresAt ? expiresAt - 60_000 <= now : true;
    if (!isExpired && connection.accessToken) {
      return { accessToken: connection.accessToken, connection };
    }

    if (!connection.refreshToken) {
      if (connection.accessToken) {
        return { accessToken: connection.accessToken, connection };
      }
      throw new ForbiddenException('Google Drive Verbindung abgelaufen.');
    }

    const refreshed = await this.refreshAccessToken(connection.refreshToken);
    const expiresIn = refreshed.expires_in ?? 0;
    const expiresAtDate = expiresIn ? new Date(now + expiresIn * 1000) : null;
    const updated = await this.prisma.googleDriveConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: refreshed.access_token ?? connection.accessToken,
        scope: refreshed.scope ?? connection.scope,
        tokenType: refreshed.token_type ?? connection.tokenType,
        expiresAt: expiresAtDate ?? connection.expiresAt,
      },
    });

    return { accessToken: updated.accessToken, connection: updated };
  }

  async getStatus(): Promise<GoogleDriveStatusResponse> {
    const maxFileSizeMb = this.getMaxFileSizeMb();
    const connection = await this.getConnection();
    if (!connection) {
      return {
        connected: false,
        maxFileSizeMb,
      };
    }
    return {
      connected: true,
      email: connection.email,
      displayName: connection.displayName,
      avatarUrl: connection.avatarUrl,
      connectedAt: connection.createdAt.toISOString(),
      maxFileSizeMb,
    };
  }

  createAuthUrl(returnTo?: string | null) {
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const config = this.getDriveConfig();
    const redirectTarget = this.sanitizeReturnTo(returnTo, '/drive?tab=google');
    const state = this.signState({
      tenantId,
      userId,
      returnTo: redirectTarget,
    });
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', state);
    return { url: url.toString() };
  }

  async handleOAuthCallback(code: string, state: string) {
    if (!code || !state) {
      throw new BadRequestException('OAuth-Parameter fehlen.');
    }
    const config = this.getDriveConfig();
    const parsed = this.parseState(state);
    const payload = new URLSearchParams();
    payload.set('code', code);
    payload.set('client_id', config.clientId);
    payload.set('client_secret', config.clientSecret);
    payload.set('redirect_uri', config.redirectUri);
    payload.set('grant_type', 'authorization_code');

    const token = await this.exchangeToken(payload);
    const expiresIn = token.expires_in ?? 0;
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : null;
    const userInfo = await this.getUserInfo(token.access_token);

    const existing = await this.prisma.googleDriveConnection.findUnique({
      where: {
        tenantId_userId: { tenantId: parsed.tenantId, userId: parsed.userId },
      },
    });

    await this.prisma.googleDriveConnection.upsert({
      where: {
        tenantId_userId: { tenantId: parsed.tenantId, userId: parsed.userId },
      },
      create: {
        tenantId: parsed.tenantId,
        userId: parsed.userId,
        email: userInfo.email ?? null,
        displayName: userInfo.name ?? null,
        avatarUrl: userInfo.picture ?? null,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        scope: token.scope ?? null,
        tokenType: token.token_type ?? null,
        expiresAt,
      },
      update: {
        email: userInfo.email ?? existing?.email ?? null,
        displayName: userInfo.name ?? existing?.displayName ?? null,
        avatarUrl: userInfo.picture ?? existing?.avatarUrl ?? null,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? existing?.refreshToken ?? null,
        scope: token.scope ?? existing?.scope ?? null,
        tokenType: token.token_type ?? existing?.tokenType ?? null,
        expiresAt,
      },
    });

    return `${config.frontendUrl}${parsed.returnTo}`;
  }

  async disconnect() {
    const connection = await this.getConnection();
    if (!connection) {
      return { disconnected: true };
    }
    await this.prisma.googleDriveConnection.delete({
      where: { id: connection.id },
    });
    return { disconnected: true };
  }

  async listSharedDrives(): Promise<GoogleDriveSharedDrive[]> {
    const { accessToken } = await this.getValidAccessToken();
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    params.set('fields', 'drives(id,name)');
    const response = await fetch(
      `${GOOGLE_DRIVE_API}/drives?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    await this.ensureOk(
      response,
      'Shared Drives konnten nicht geladen werden.',
    );
    const data = (await response.json()) as GoogleSharedDrivesResponse;
    return (data.drives ?? [])
      .filter((drive) => drive.id && drive.name)
      .map((drive) => ({
        id: drive.id as string,
        name: drive.name as string,
      }));
  }

  async listFiles(
    dto: ListGoogleDriveFilesDto,
  ): Promise<GoogleDriveFileListResponse> {
    const { accessToken } = await this.getValidAccessToken();
    const pageSize = Math.min(dto.pageSize ?? 20, 100);
    const queryParts = [
      'trashed = false',
      "mimeType != 'application/vnd.google-apps.folder'",
    ];
    if (dto.search?.trim()) {
      const cleaned = dto.search
        .trim()
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
      queryParts.push(`name contains '${cleaned}'`);
    }
    const params = new URLSearchParams();
    params.set('pageSize', String(pageSize));
    params.set(
      'fields',
      'nextPageToken, files(id,name,mimeType,size,modifiedTime,driveId,webViewLink)',
    );
    params.set('orderBy', 'modifiedTime desc');
    params.set('q', queryParts.join(' and '));
    if (dto.pageToken) {
      params.set('pageToken', dto.pageToken);
    }
    if (dto.driveId) {
      params.set('driveId', dto.driveId);
      params.set('corpora', 'drive');
      params.set('supportsAllDrives', 'true');
      params.set('includeItemsFromAllDrives', 'true');
    } else {
      params.set('corpora', 'user');
      params.set('supportsAllDrives', 'true');
      params.set('includeItemsFromAllDrives', 'false');
    }

    const response = await fetch(
      `${GOOGLE_DRIVE_API}/files?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    await this.ensureOk(
      response,
      'Google Drive Dateien konnten nicht geladen werden.',
    );
    const data = (await response.json()) as GoogleDriveFilesResponse;
    const items: GoogleDriveFileResponse[] = (data.files ?? [])
      .filter((file) => file.id)
      .map((file) => ({
        id: file.id as string,
        name: this.sanitizeFileName(file.name),
        mimeType: file.mimeType ?? 'application/octet-stream',
        size: file.size ? Number(file.size) : null,
        driveId: file.driveId ?? null,
        modifiedTime: file.modifiedTime ?? null,
        webViewLink: file.webViewLink ?? null,
      }));

    return {
      items,
      nextPageToken: data.nextPageToken ?? null,
    };
  }

  async downloadFile(fileId: string, driveId?: string | null) {
    if (!fileId) {
      throw new BadRequestException('Datei-ID fehlt.');
    }
    const { accessToken } = await this.getValidAccessToken();
    const config = this.getDriveConfig();
    const metadataParams = new URLSearchParams();
    metadataParams.set('fields', 'id,name,mimeType,size');
    if (driveId) {
      metadataParams.set('supportsAllDrives', 'true');
    }
    const metadataResponse = await fetch(
      `${GOOGLE_DRIVE_API}/files/${fileId}?${metadataParams.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    await this.ensureOk(metadataResponse, 'Datei konnte nicht geladen werden.');
    const metadata = (await metadataResponse.json()) as {
      name?: string;
      mimeType?: string;
      size?: string;
    };

    const maxBytes = config.maxFileSizeMb * 1024 * 1024;
    const sizeBytes = metadata.size ? Number(metadata.size) : null;
    if (sizeBytes && sizeBytes > maxBytes) {
      throw new BadRequestException(
        `Datei ist zu groß. Maximal ${config.maxFileSizeMb} MB erlaubt.`,
      );
    }

    const isGoogleDoc =
      metadata.mimeType?.startsWith('application/vnd.google-apps') ?? false;
    const fileNameBase = this.sanitizeFileName(metadata.name);
    const downloadUrl = new URL(`${GOOGLE_DRIVE_API}/files/${fileId}`);
    let fileName = fileNameBase;
    let mimeType = metadata.mimeType ?? 'application/octet-stream';

    if (isGoogleDoc) {
      const exportMime = 'application/pdf';
      downloadUrl.pathname = `/drive/v3/files/${fileId}/export`;
      downloadUrl.searchParams.set('mimeType', exportMime);
      if (driveId) {
        downloadUrl.searchParams.set('supportsAllDrives', 'true');
      }
      mimeType = exportMime;
      fileName = fileNameBase.toLowerCase().endsWith('.pdf')
        ? fileNameBase
        : `${fileNameBase}.pdf`;
    } else {
      downloadUrl.searchParams.set('alt', 'media');
      if (driveId) {
        downloadUrl.searchParams.set('supportsAllDrives', 'true');
      }
    }

    const response = await fetch(downloadUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    await this.ensureOk(response, 'Download fehlgeschlagen.');

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const length = Number(contentLength);
      if (length && length > maxBytes) {
        throw new BadRequestException(
          `Datei ist zu groß. Maximal ${config.maxFileSizeMb} MB erlaubt.`,
        );
      }
    }

    if (!response.body) {
      throw new InternalServerErrorException('Download-Stream fehlt.');
    }

    return {
      stream: response.body as unknown as Readable,
      fileName,
      mimeType,
      size: contentLength ? Number(contentLength) : (sizeBytes ?? undefined),
    };
  }
}
