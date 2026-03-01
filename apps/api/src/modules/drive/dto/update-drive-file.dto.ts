import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateDriveFileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string | null;
}
