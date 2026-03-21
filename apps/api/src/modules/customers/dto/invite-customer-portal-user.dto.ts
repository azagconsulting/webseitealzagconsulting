import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class InviteCustomerPortalUserDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;
}
