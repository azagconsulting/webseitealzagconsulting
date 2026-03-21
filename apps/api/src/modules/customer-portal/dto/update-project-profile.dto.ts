import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProjectProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  mobile?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  street?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  preferredChannel?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  legalName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  industry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  companySize?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  primaryContactName?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  billingEmail?: string | null;

  @IsOptional()
  @IsString()
  projectGoals?: string | null;

  @IsOptional()
  @IsString()
  brandNotes?: string | null;
}
