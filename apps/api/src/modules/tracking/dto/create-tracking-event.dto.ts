import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TrackingEventType } from '@prisma/client';

export class CreateTrackingEventDto {
  @IsString()
  @MinLength(8)
  @MaxLength(191)
  sessionId!: string;

  @IsEnum(TrackingEventType)
  type!: TrackingEventType;

  @IsString()
  @MaxLength(255)
  path!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmMedium?: string;
}
