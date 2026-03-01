import { IsIn, IsOptional, IsString, MaxLength, IsUrl } from 'class-validator';

export class UpdateApiSettingsDto {
  @IsOptional()
  @IsUrl({}, { message: 'Bitte eine gültige URL angeben (https://...)' })
  @MaxLength(512)
  embedUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  serviceAccountJson?: string;

  @IsOptional()
  @IsIn(['LOCAL', 'GA'])
  trackingMode?: 'LOCAL' | 'GA';
}
