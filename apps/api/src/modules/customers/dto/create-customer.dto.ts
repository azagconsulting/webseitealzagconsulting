import {
  CustomerPackage,
  CustomerType,
  VehicleFuelType,
  VehicleTransmission,
} from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCustomerContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  channel?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;
}

export class CreateVehicleDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trim?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  licensePlate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  vin?: string;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileageKm?: number;

  @IsOptional()
  @IsEnum(VehicleFuelType)
  fuelType?: VehicleFuelType;

  @IsOptional()
  @IsEnum(VehicleTransmission)
  transmission?: VehicleTransmission;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  color?: string;

  @IsOptional()
  @IsDateString()
  lastServiceAt?: string;

  @IsOptional()
  @IsDateString()
  nextServiceAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CustomerPackageServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  name!: string;

  @IsEnum(CustomerType)
  type!: CustomerType;

  @IsOptional()
  @IsEnum(CustomerPackage)
  customerPackage?: CustomerPackage;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomerPackageServiceDto)
  packageServices?: CustomerPackageServiceDto[];

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  preferredChannel?: string;

  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  lastContactAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCustomerContactDto)
  contacts?: CreateCustomerContactDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVehicleDto)
  vehicles?: CreateVehicleDto[];
}
