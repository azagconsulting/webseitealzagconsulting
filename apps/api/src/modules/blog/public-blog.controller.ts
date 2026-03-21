import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../auth/decorators/public.decorator';
import { BlogService } from './blog.service';

@Controller({
  path: 'public/blog',
  version: '1',
})
export class PublicBlogController {
  constructor(private readonly blogService: BlogService) {}

  @Public()
  @Get()
  list(@Query('limit', new DefaultValuePipe(9), ParseIntPipe) limit: number) {
    return this.blogService.listPublicPosts(limit);
  }

  @Public()
  @Get('cover/:id')
  async cover(@Param('id') id: string, @Res() res: Response) {
    const download = await this.blogService.getBlogCoverStream(id);
    res.setHeader('Content-Type', download.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(download.fileName)}"`,
    );
    res.setHeader('Content-Length', download.size.toString());
    download.stream.pipe(res);
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.blogService.getPublishedPost(slug);
  }
}
