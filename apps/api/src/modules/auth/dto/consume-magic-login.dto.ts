import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ConsumeMagicLoginDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  deviceId?: string;
}

