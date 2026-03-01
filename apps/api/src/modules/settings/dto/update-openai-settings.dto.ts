import { IsOptional, IsString } from 'class-validator';

export class UpdateOpenAiSettingsDto {
  @IsOptional()
  @IsString()
  apiKey?: string | null;
}
