import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateWorkspaceSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  tagline?: string;

  @IsOptional()
  @IsString()
  mission?: string;

  @IsOptional()
  @IsString()
  vision?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  foundedYear?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(100000)
  teamSize?: number;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  supportPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  vatNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  registerNumber?: string;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsUUID()
  logoFileId?: string | null;

  @IsOptional()
  @IsString()
  website?: string;
}
