import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

import type { SmtpEncryption } from '../../../common/interfaces/smtp-settings.interface';

const ENCRYPTION_VALUES: SmtpEncryption[] = ['none', 'ssl', 'tls'];

export class UpdateContactSmtpSettingsDto {
  @IsString()
  @IsNotEmpty()
  host!: string;

  @Transform(({ value }): number | undefined => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    return undefined;
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string;

  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @IsOptional()
  @IsIn(ENCRYPTION_VALUES)
  encryption?: SmtpEncryption;

  @IsOptional()
  hasPassword?: boolean;

  @IsOptional()
  verifiedAt?: string;
}
