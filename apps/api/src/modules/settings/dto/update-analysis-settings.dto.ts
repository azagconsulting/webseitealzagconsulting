import { IsBoolean } from 'class-validator';

export class UpdateAnalysisSettingsDto {
  @IsBoolean()
  enabled!: boolean;
}
