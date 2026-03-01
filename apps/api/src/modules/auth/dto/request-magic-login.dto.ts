import { IsEmail } from 'class-validator';

export class RequestMagicLoginDto {
  @IsEmail()
  email!: string;
}

