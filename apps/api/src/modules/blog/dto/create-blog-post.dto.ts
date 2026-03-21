import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBlogPostDto {
  @IsString()
  @MinLength(5)
  @MaxLength(191)
  title!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  excerpt?: string;

  @IsString()
  @MinLength(20)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  coverImage?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsISO8601()
  @Type(() => Date)
  publishedAt?: Date;
}
