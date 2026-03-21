import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SendAttachmentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  data!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  size?: number;
}

export class SendCustomerMessageDto {
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsEmail()
  toEmail?: string;

  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  preview?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SendAttachmentDto)
  attachments?: SendAttachmentDto[];

  @IsString()
  @IsNotEmpty()
  body!: string;
}

export { SendAttachmentDto };
