import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadChatAttachmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}
