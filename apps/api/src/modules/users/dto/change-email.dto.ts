import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ChangeEmailDto {
  @IsEmail()
  newEmail!: string;

  @IsEmail()
  confirmEmail!: string;

  @IsString()
  @IsNotEmpty()
  currentPassword!: string;
}
