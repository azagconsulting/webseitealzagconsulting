import { ServiceOrderStatus } from '@prisma/client';
import {
  IsUUID,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateServiceOrderDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsString()
  @MaxLength(191)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  concern?: string;

  @IsOptional()
  @IsEnum(ServiceOrderStatus)
  status?: ServiceOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  advisorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  technicianName?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimateCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalCents?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
