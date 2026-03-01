import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import isURL from 'validator/lib/isURL';

function IsUrlOrDriveId(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUrlOrDriveId',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string' || !value.trim()) {
            return true;
          }
          if (value.startsWith('drive:')) {
            return true;
          }
          return isURL(value, { require_protocol: true });
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid URL or a drive:<id>`;
        },
      },
    });
  };
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  headline?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  pronouns?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsUrlOrDriveId()
  avatarUrl?: string;

  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @IsOptional()
  @IsUrl()
  twitterUrl?: string;

  @IsOptional()
  @IsUrl()
  calendlyUrl?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
