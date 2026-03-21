import { IsBoolean } from 'class-validator';

export class UpdateChatbotLauncherDto {
  @IsBoolean()
  enabled: boolean;
}
