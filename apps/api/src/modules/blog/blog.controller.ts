import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BlogService } from './blog.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { GenerateCoverImageDto } from './dto/generate-cover-image.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

@Controller({
  path: 'blog/posts',
  version: '1',
})
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  list(
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    const normalizedStatus =
      status === 'draft' || status === 'published' ? status : undefined;
    return this.blogService.listPosts(limit, normalizedStatus);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.blogService.getPostById(id);
  }

  @Post()
  create(@Body() dto: CreateBlogPostDto, @CurrentUser() user?: AuthUser) {
    return this.blogService.createPost(dto, user);
  }

  @Post('cover-image')
  generateCoverImage(
    @Body() dto: GenerateCoverImageDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.blogService.generateCoverImage(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBlogPostDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.blogService.updatePost(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.blogService.deletePost(id);
  }
}
