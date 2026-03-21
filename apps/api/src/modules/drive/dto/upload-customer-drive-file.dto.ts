import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadCustomerDriveFileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}
