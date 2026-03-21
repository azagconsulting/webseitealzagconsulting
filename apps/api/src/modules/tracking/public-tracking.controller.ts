import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../auth/decorators/public.decorator';
import { CreateTrackingEventDto } from './dto/create-tracking-event.dto';
import { TrackingService } from './tracking.service';

@Controller({
  path: 'public/tracking',
  version: '1',
})
export class PublicTrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Public()
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @Post('events')
  recordEvent(@Body() dto: CreateTrackingEventDto) {
    return this.trackingService.recordEvent(dto);
  }
}
