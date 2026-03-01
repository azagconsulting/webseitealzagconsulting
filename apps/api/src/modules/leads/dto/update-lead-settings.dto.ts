import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateLeadSettingsDto {
  @IsOptional()
  @IsEmail()
  notifyEmail?: string;

  @IsOptional()
  @IsUUID()
  autoAssignUserId?: string | null;

  @IsOptional()
  @IsBoolean()
  autoResponderEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  autoResponderMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  routingHeadline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  routingDescription?: string;
}
