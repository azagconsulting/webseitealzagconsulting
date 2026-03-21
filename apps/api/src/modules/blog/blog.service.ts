import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import path from 'path';
import fetch, { Response } from 'node-fetch';
import type { Prisma } from '@prisma/client';
import { DriveScope } from '@prisma/client';
import type { Express } from 'express';
import { marked } from 'marked';
import { access, mkdir, rm, writeFile } from 'fs/promises';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { DriveService } from '../drive/drive.service';
import { SettingsService } from '../settings/settings.service';
import type { CreateBlogPostDto } from './dto/create-blog-post.dto';
import type { GenerateCoverImageDto } from './dto/generate-cover-image.dto';
import type { UpdateBlogPostDto } from './dto/update-blog-post.dto';

const authorSelect = {
  id: true,
  firstName: true,
  lastName: true,
} as const;

const BLOG_MEDIA_PREFIX = '/blog-media';
const BLOG_FOLDER_NAME = 'Blog Beiträge';
const BLOG_ASSET_PATH = '/api/v1/public/blog/cover';
const BLOG_STATIC_RELATIVE =
  'apps/web/public/Webseite Autohaus Herrmann/pages/blog';

@Injectable()
export class BlogService {
  private static readonly MAX_LIMIT = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly driveService: DriveService,
    private readonly settingsService: SettingsService,
  ) {}

  async listPosts(limit = 25, status?: 'draft' | 'published') {
    const take = this.clampLimit(limit, BlogService.MAX_LIMIT);
    const where: Prisma.BlogPostWhereInput = {};

    if (status === 'draft') {
      where.published = false;
    } else if (status === 'published') {
      where.published = true;
    }

    const [items, published, drafts] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        take,
        orderBy: [
          { published: 'desc' },
          { featured: 'desc' },
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        include: { author: { select: authorSelect } },
      }),
      this.prisma.blogPost.count({ where: { published: true } }),
      this.prisma.blogPost.count({ where: { published: false } }),
    ]);

    return {
      items,
      stats: {
        total: published + drafts,
        published,
        drafts,
      },
    };
  }

  async getPostById(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: { author: { select: authorSelect } },
    });

    if (!post) {
      throw new NotFoundException('Blogpost nicht gefunden');
    }

    return post;
  }

  async getPostBySlug(slug: string, opts?: { includeDraft?: boolean }) {
    const post = await this.prisma.blogPost.findUnique({
      where: { slug },
      include: { author: { select: authorSelect } },
    });

    if (!post) {
      throw new NotFoundException('Blogpost nicht gefunden');
    }

    if (!opts?.includeDraft && !post.published) {
      throw new NotFoundException('Blogpost nicht veröffentlicht');
    }

    return post;
  }

  async listPublicPosts(limit = 9) {
    const take = this.clampLimit(limit, 50);

    const items = await this.prisma.blogPost.findMany({
      where: { published: true },
      take,
      orderBy: [
        { featured: 'desc' },
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      include: { author: { select: authorSelect } },
    });

    return { items };
  }

  async getPublishedPost(slug: string) {
    return this.getPostBySlug(slug, { includeDraft: false });
  }

  async createPost(dto: CreateBlogPostDto, actor?: AuthUser) {
    const slug = await this.ensureSlug(dto.slug ?? dto.title);
    const published = dto.published ?? false;
    const publishedAt = published ? this.normalizeDate(dto.publishedAt) : null;

    const coverImage = await this.persistCoverImage(dto.coverImage, actor);

    const post = await this.prisma.blogPost.create({
      data: {
        title: dto.title.trim(),
        slug,
        excerpt: this.cleanString(dto.excerpt),
        content: dto.content.trim(),
        coverImage,
        featured: dto.featured ?? false,
        published,
        publishedAt,
        authorId: actor?.sub ?? undefined,
      },
      include: { author: { select: authorSelect } },
    });

    await this.generateStaticPage(post);
    return post;
  }

  async updatePost(id: string, dto: UpdateBlogPostDto, actor?: AuthUser) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Blogpost nicht gefunden');
    }

    const data: Prisma.BlogPostUpdateInput = {};

    if (dto.title) {
      data.title = dto.title.trim();
    }

    if (dto.excerpt !== undefined) {
      data.excerpt = this.cleanString(dto.excerpt) ?? null;
    }

    if (dto.content) {
      data.content = dto.content.trim();
    }

    if (dto.coverImage !== undefined) {
      const stored = await this.persistCoverImage(dto.coverImage, actor);
      data.coverImage = stored ?? null;
    }

    if (dto.featured !== undefined) {
      data.featured = dto.featured;
    }

    if (dto.slug !== undefined) {
      const trimmed = dto.slug.trim();
      if (!trimmed) {
        throw new BadRequestException('Slug darf nicht leer sein');
      }

      if (trimmed !== existing.slug) {
        data.slug = await this.ensureSlug(trimmed, existing.id);
      }
    }

    if (dto.published !== undefined) {
      data.published = dto.published;
      data.publishedAt = dto.published
        ? this.normalizeDate(
            dto.publishedAt ?? existing.publishedAt ?? undefined,
          )
        : null;
    } else if (dto.publishedAt !== undefined) {
      data.publishedAt = dto.publishedAt
        ? this.normalizeDate(dto.publishedAt)
        : null;
    }

    if (actor?.sub && !existing.authorId) {
      data.author = {
        connect: { id: actor.sub },
      };
    }

    const post = await this.prisma.blogPost.update({
      where: { id },
      data,
      include: { author: { select: authorSelect } },
    });

    await this.generateStaticPage(post);
    return post;
  }

  async deletePost(id: string) {
    const existing = await this.prisma.blogPost.findUnique({
      where: { id },
      select: { slug: true },
    });
    await this.prisma.blogPost.delete({ where: { id } });
    if (existing?.slug) {
      await this.removeStaticPage(existing.slug);
    }
  }

  async generateCoverImage(dto: GenerateCoverImageDto, actor?: AuthUser) {
    const settings = await this.settingsService.getOpenAiSettings({
      includeSecret: true,
    });
    const apiKey = settings?.apiKey?.trim();
    if (!apiKey) {
      throw new BadRequestException(
        'OpenAI-Key fehlt. Bitte in den Einstellungen hinterlegen.',
      );
    }

    const title = this.cleanString(dto.title);
    const excerpt = this.cleanString(dto.excerpt);
    const content = this.cleanString(dto.content);
    const coverPrompt = this.cleanString(dto.coverPrompt);
    const contentSnippet =
      content && content.length > 1200 ? `${content.slice(0, 1200)}…` : content;

    if (!title && !excerpt && !content) {
      throw new BadRequestException(
        'Bitte Titel, Untertitel oder Inhalt angeben.',
      );
    }

    const promptLines = [
      'Erstelle ein hochwertiges, modernes Coverbild fuer einen deutschsprachigen Blogartikel.',
      title ? `Titel: ${title}` : null,
      excerpt ? `Untertitel: ${excerpt}` : null,
      contentSnippet ? `Inhalt (Auszug): ${contentSnippet}` : null,
      coverPrompt ? `Cover-Idee: ${coverPrompt}` : null,
      'Stil: editorial, klar, ohne Text oder Logos im Bild, ruhige Komposition, natuerliche Farben.',
      'Keine Schrift, keine Logos, keine Wasserzeichen.',
    ].filter(Boolean);

    const prompt = promptLines.join('\n');

    type OpenAiErrorPayload = {
      error?: { message?: string };
      message?: string;
    };
    type OpenAiImagePayload = {
      data?: Array<{
        b64_json?: string;
        url?: string;
      }>;
    };

    const requestImage = async (
      requestPayload: Record<string, unknown>,
    ): Promise<OpenAiImagePayload> => {
      const response = await fetch(
        'https://api.openai.com/v1/images/generations',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestPayload),
        },
      );

      if (!response.ok) {
        let detail = '';
        try {
          const payload = (await response.json()) as OpenAiErrorPayload;
          detail =
            payload?.error?.message ||
            payload?.message ||
            JSON.stringify(payload);
        } catch {
          detail = (await response.text()) || response.statusText;
        }
        throw new BadRequestException(
          detail ? `OpenAI-Fehler: ${detail}` : 'OpenAI-Fehler.',
        );
      }

      return (await response.json()) as OpenAiImagePayload;
    };

    let body: OpenAiImagePayload;
    try {
      body = await requestImage({
        model: 'gpt-image-1',
        prompt,
        size: '1024x1024',
        response_format: 'b64_json',
      });
    } catch {
      body = await requestImage({
        model: 'dall-e-3',
        prompt,
        size: '1024x1024',
        quality: 'standard',
        style: 'natural',
      });
    }

    const imageData = body?.data?.[0];
    let buffer: Buffer | null = null;
    let mime: string | null = 'image/png';

    if (imageData?.b64_json) {
      buffer = Buffer.from(imageData.b64_json, 'base64');
      mime = 'image/png';
    } else if (imageData?.url) {
      const remote = await this.fetchRemoteImage(imageData.url);
      if (remote) {
        buffer = remote.buffer;
        mime = remote.mime;
      }
    }

    if (!buffer) {
      throw new BadRequestException('Keine Bilddaten von OpenAI erhalten.');
    }

    const fileName = this.buildCoverFileName(title ?? 'blog');
    const uploaded = await this.uploadCoverBuffer({
      buffer,
      mime,
      fileName,
      user: actor,
    });

    return {
      url: this.buildBlogAssetUrl(uploaded.id),
      fileId: uploaded.id,
      fileName: uploaded.name,
    };
  }

  private async ensureSlug(input: string, ignoreId?: string) {
    const base = this.slugify(input);
    if (!base) {
      throw new BadRequestException('Slug konnte nicht generiert werden');
    }

    let candidate = base;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.blogPost.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!existing || existing.id === ignoreId) {
        return candidate;
      }

      counter += 1;
      candidate = `${base}-${counter}`;
    }
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  private buildCoverFileName(title: string) {
    const base = this.slugify(title) || `blog-cover-${Date.now()}`;
    return `${base}-cover.png`;
  }

  private normalizeDate(value?: Date | null) {
    if (!value) {
      return new Date();
    }

    return new Date(value);
  }

  private cleanString(value?: string | null) {
    if (value === undefined || value === null) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  private normalizeBase(value?: string | null) {
    if (!value) {
      return '';
    }
    return value.trim().replace(/\/$/, '');
  }

  private buildBlogAssetUrl(id: string) {
    const path = `${BLOG_ASSET_PATH}/${id}`;
    const base =
      this.normalizeBase(process.env.NEXT_PUBLIC_API_URL) ||
      this.normalizeBase(process.env.API_INTERNAL_URL) ||
      this.normalizeBase(process.env.API_PROXY_TARGET);
    return base ? `${base}${path}` : path;
  }

  private isBlogAsset(value: string) {
    return (
      value.includes('/public/blog/cover/') ||
      value.includes('/public/blog/assets/')
    );
  }

  private formatDate(value?: string | Date | null) {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'long',
      }).format(new Date(value));
    } catch {
      return '—';
    }
  }

  private escapeHtml(input: string) {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async resolveStaticDir() {
    const candidates = [
      // typical monorepo root -> apps/web/public/...
      path.resolve(process.cwd(), '..', BLOG_STATIC_RELATIVE),
      // running from repo root
      path.resolve(process.cwd(), BLOG_STATIC_RELATIVE),
      // fallback using __dirname traversal
      path.resolve(__dirname, '..', '..', '..', '..', BLOG_STATIC_RELATIVE),
    ];

    for (const candidate of candidates) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // not existing yet, try to create if parent path seems valid
        try {
          await mkdir(candidate, { recursive: true });
          return candidate;
        } catch {
          // continue
        }
      }
    }

    // last resort: create under repo root one level up
    const fallback = path.resolve(process.cwd(), '..', BLOG_STATIC_RELATIVE);
    await mkdir(fallback, { recursive: true });
    return fallback;
  }

  private async generateStaticPage(post: {
    slug: string;
    title: string;
    excerpt?: string | null;
    content: string;
    coverImage?: string | null;
    published?: boolean | null;
    publishedAt?: string | Date | null;
    author?: { firstName?: string | null; lastName?: string | null } | null;
  }) {
    if (!post.slug || !post.published) {
      await this.removeStaticPage(post.slug);
      return;
    }

    const safeTitle = post.title?.trim() || 'Blogbeitrag';
    const safeExcerpt = this.escapeHtml(
      post.excerpt?.trim() || 'Aktueller Beitrag aus dem Autohaus Herrmann.',
    );
    const cover = post.coverImage?.trim() || '';
    const authorName = post.author?.firstName
      ? `${post.author.firstName} ${post.author.lastName ?? ''}`.trim()
      : 'Autohaus Herrmann';
    const publishedLabel = this.formatDate(post.publishedAt);
    const targetDir = await this.resolveStaticDir();
    const filePath = path.join(targetDir, `${post.slug}.html`);

    const parsedContent = await Promise.resolve(
      marked.parse(post.content || ''),
    );

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${this.escapeHtml(safeTitle)} | Autohaus Herrmann Blog</title>
  <meta name="description" content="${safeExcerpt}" />
  <meta property="og:title" content="${this.escapeHtml(safeTitle)}" />
  <meta property="og:description" content="${safeExcerpt}" />
  ${cover ? `<meta property="og:image" content="${cover}" />` : ''}
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Autohaus Herrmann" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" integrity="sha512-SnH5WK+bZxgPHs44uWIX+LLJAJ9/2PkPKZ5QiAj6Ta86w+fsb2TkcmfRyVX3pBnMFcV7oQPJkl9QevSCWr3W6A==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="../assets/css/style.css" />
  <link rel="stylesheet" href="../assets/css/slick.css" />
  <link rel="stylesheet" href="../assets/css/slick-theme.css" />
  <style>
    body { background: #0f172a; color: #e2e8f0; line-height: 1.7; }
    .post-wrapper { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
    .post-hero { border-radius: 28px; overflow: hidden; margin-bottom: 28px; position: relative; }
    .post-hero .bg { height: 320px; background-size: cover; background-position: center; }
    .post-meta { display: flex; gap: 12px; flex-wrap: wrap; color: #cbd5e1; font-size: 14px; margin-top: 12px; }
    .post-content { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 24px; padding: 28px; }
    .post-content h1, .post-content h2, .post-content h3, .post-content h4 { color: #fff; margin-top: 20px; }
    .post-content p { margin: 12px 0; }
    .post-content ul { margin: 12px 0 12px 20px; }
    .cta { margin-top: 36px; display: inline-flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: 9999px; background: linear-gradient(135deg, #38bdf8, #7c3aed); color: #0b1221; font-weight: 700; text-decoration: none; }
    .cta:hover { opacity: 0.9; }
    .back-link { color: #38bdf8; text-decoration: none; font-weight: 600; }
    .back-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <header class="main-header">
    <nav class="main-nav" aria-label="Hauptnavigation">
      <div class="logo">
        <a href="/" aria-label="Zur Startseite des Autohaus Herrmann">
          <img src="../assets/images/logo/logo.png" alt="Autohaus Herrmann Logo">
        </a>
      </div>
      <ul class="desktop-nav">
        <li><a href="/">Startseite</a></li>
        <li><a href="service">Service</a></li>
        <li><a href="ueber-uns">Über uns</a></li>
        <li><a href="kontakt">Kontakt</a></li>
      </ul>
    </nav>
  </header>

  <main class="post-wrapper">
    <a class="back-link" href="../blog.html">← Zurück zur Blog-Übersicht</a>
    <div class="post-hero">
      <div class="bg" style="background-image: linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.6)), url('${cover || '../assets/images/hero/image1.jpg'}');"></div>
    </div>
    <h1>${this.escapeHtml(safeTitle)}</h1>
    <div class="post-meta">
      <span><i class="far fa-calendar"></i> ${publishedLabel}</span>
      <span><i class="far fa-user"></i> ${this.escapeHtml(authorName)}</span>
    </div>
    <div class="post-content">
      ${parsedContent || '<p>Kein Inhalt vorhanden.</p>'}
    </div>
    <a class="cta" href="kontakt">Kontakt aufnehmen</a>
  </main>
</body>
</html>`;

    await writeFile(filePath, html, 'utf8');
  }

  private async removeStaticPage(slug?: string | null) {
    if (!slug) return;
    const dir = await this.resolveStaticDir();
    const filePath = path.join(dir, `${slug}.html`);
    await rm(filePath, { force: true });
  }

  private async ensureBlogFolder(user?: AuthUser) {
    const folders = await this.driveService.listFolders(
      { scope: DriveScope.TEAM, limit: 100 },
      user,
    );
    const existing = folders.find(
      (folder) => folder.name.toLowerCase() === BLOG_FOLDER_NAME.toLowerCase(),
    );
    if (existing) {
      return existing.id;
    }
    try {
      const created = await this.driveService.createFolder(
        { name: BLOG_FOLDER_NAME, scope: DriveScope.TEAM },
        user,
      );
      return created.id;
    } catch (error) {
      // Fallback, falls in Parallelität bereits erstellt wurde
      const retry = await this.driveService.listFolders(
        { scope: DriveScope.TEAM, limit: 100 },
        user,
      );
      const found = retry.find(
        (folder) =>
          folder.name.toLowerCase() === BLOG_FOLDER_NAME.toLowerCase(),
      );
      if (found) {
        return found.id;
      }
      throw error;
    }
  }

  private async uploadCoverBuffer(params: {
    buffer: Buffer;
    mime?: string | null;
    fileName: string;
    user?: AuthUser;
  }) {
    const folderId = await this.ensureBlogFolder(params.user);
    const fakeFile = {
      buffer: params.buffer,
      originalname: params.fileName,
      mimetype: params.mime || 'application/octet-stream',
      size: params.buffer.length,
    } as Express.Multer.File;
    const uploaded = await this.driveService.uploadFile(
      {
        scope: DriveScope.TEAM,
        folderId,
        name: params.fileName,
      },
      fakeFile,
      params.user,
    );
    return uploaded;
  }

  private parseDataImage(payload: string) {
    const match = payload.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(?<data>.+)$/,
    );
    if (!match?.groups?.data) {
      throw new BadRequestException('Ungültiges Cover-Bild.');
    }
    const mime = match[1];
    const buffer = Buffer.from(match.groups.data, 'base64');
    const extension = this.extensionFromMime(mime) ?? 'png';
    const filename = `${Date.now()}-${randomUUID()}.${extension}`;
    return { buffer, mime, filename };
  }

  private async fetchRemoteImage(url: string) {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const mime = response.headers.get('content-type') ?? '';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const extension =
      this.extensionFromMime(mime) ??
      (path.extname(new URL(url).pathname).replace('.', '') || 'jpg');
    const filename = `${Date.now()}-${randomUUID()}.${extension}`;
    return { buffer, mime: mime || 'application/octet-stream', filename };
  }

  private async persistCoverImage(value?: string | null, user?: AuthUser) {
    const cleaned = this.cleanString(value);
    if (!cleaned) {
      return undefined;
    }

    if (
      cleaned.startsWith(BLOG_MEDIA_PREFIX) ||
      this.isBlogAsset(cleaned) ||
      (cleaned.startsWith('http://') && this.isBlogAsset(cleaned)) ||
      (cleaned.startsWith('https://') && this.isBlogAsset(cleaned))
    ) {
      return cleaned;
    }

    if (cleaned.startsWith('data:image/')) {
      const parsed = this.parseDataImage(cleaned);
      const uploaded = await this.uploadCoverBuffer({
        buffer: parsed.buffer,
        mime: parsed.mime,
        fileName: parsed.filename,
        user,
      });
      return this.buildBlogAssetUrl(uploaded.id);
    }

    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      const remote = await this.fetchRemoteImage(cleaned);
      if (!remote) {
        return cleaned;
      }
      const uploaded = await this.uploadCoverBuffer({
        buffer: remote.buffer,
        mime: remote.mime,
        fileName: remote.filename,
        user,
      });
      return this.buildBlogAssetUrl(uploaded.id);
    }

    return cleaned;
  }

  private extensionFromMime(mime: string) {
    if (!mime) {
      return null;
    }
    if (mime.includes('jpeg') || mime.includes('jpg')) {
      return 'jpg';
    }
    if (mime.includes('png')) {
      return 'png';
    }
    if (mime.includes('webp')) {
      return 'webp';
    }
    if (mime.includes('gif')) {
      return 'gif';
    }
    if (mime.includes('svg')) {
      return 'svg';
    }
    return null;
  }

  async getBlogCoverStream(id: string) {
    return this.driveService.getPublicFileStream(id, {
      allowedFolderNames: [BLOG_FOLDER_NAME],
      scope: DriveScope.TEAM,
    });
  }

  private clampLimit(limit: number, max: number) {
    if (!Number.isFinite(limit)) {
      return max;
    }

    return Math.min(Math.max(Math.floor(limit), 1), max);
  }
}
