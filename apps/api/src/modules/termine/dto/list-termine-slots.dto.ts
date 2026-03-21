import { IsOptional, Matches } from 'class-validator';

import { DATE_PATTERN } from '../termine.constants';

export class ListTermineSlotsDto {
  @IsOptional()
  @Matches(DATE_PATTERN)
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  to?: string;
}
