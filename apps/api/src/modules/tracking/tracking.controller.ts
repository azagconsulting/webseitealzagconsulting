import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';

import { TrackingService } from './tracking.service';

@Controller({
  path: 'tracking',
  version: '1',
})
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('summary')
  getSummary(
    @Query('days', new DefaultValuePipe(14), ParseIntPipe) days: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.trackingService.getSummary(days, from, to);
  }
}
