import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ContactRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  fullName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  company?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string | null;
}
