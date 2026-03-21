import { Module } from '@nestjs/common';

import { PublicTrackingController } from './public-tracking.controller';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  controllers: [TrackingController, PublicTrackingController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
