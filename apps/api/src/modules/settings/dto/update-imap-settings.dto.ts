import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import type { ImapEncryption } from '../../../common/interfaces/imap-settings.interface';

const ENCRYPTION_VALUES: ImapEncryption[] = ['none', 'ssl', 'tls'];

export class UpdateImapSettingsDto {
  @IsString()
  @IsNotEmpty()
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsEnum(ENCRYPTION_VALUES)
  encryption?: ImapEncryption;

  @IsOptional()
  @IsString()
  mailbox?: string;

  @IsOptional()
  @IsString()
  spamMailbox?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  sinceDays?: number;

  // Allow ignored client flags
  @IsOptional()
  hasPassword?: boolean;

  @IsOptional()
  updatedAt?: string;

  @IsOptional()
  verifiedAt?: string;
}
