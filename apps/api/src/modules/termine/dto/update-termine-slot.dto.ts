import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import {
  DATE_PATTERN,
  SLOT_STATUS_VALUES,
  TIME_PATTERN,
  type SlotStatusValue,
} from '../termine.constants';

export class UpdateTermineSlotDto {
  @IsOptional()
  @Matches(DATE_PATTERN)
  date?: string;

  @IsOptional()
  @Matches(TIME_PATTERN)
  start?: string;

  @IsOptional()
  @Matches(TIME_PATTERN)
  end?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  title?: string;

  @IsOptional()
  @IsIn(SLOT_STATUS_VALUES)
  status?: SlotStatusValue;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsUUID()
  bookedById?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bookingNotes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  attendeeName?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  attendeeEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  attendeePhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  meetingLink?: string | null;
}
