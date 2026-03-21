import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import {
  RECURRENCE_VALUES,
  SLOT_STATUS_VALUES,
  TIME_PATTERN,
  type RecurrenceValue,
  type SlotStatusValue,
} from '../termine.constants';

export class CreateTermineTemplateDto {
  @Matches(TIME_PATTERN)
  start!: string;

  @Matches(TIME_PATTERN)
  end!: string;

  @IsString()
  @MaxLength(191)
  title!: string;

  @IsOptional()
  @IsIn(SLOT_STATUS_VALUES)
  status?: SlotStatusValue;

  @IsOptional()
  @IsIn(RECURRENCE_VALUES)
  recurrence?: RecurrenceValue;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];
}
