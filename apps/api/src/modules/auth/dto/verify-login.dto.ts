import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class VerifyLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(191)
  deviceId!: string;
}
