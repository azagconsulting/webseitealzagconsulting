import { IsOptional, IsString } from 'class-validator';

export class UpdateChatbotOpenAiSettingsDto {
  @IsOptional()
  @IsString()
  apiKey?: string | null;
}
