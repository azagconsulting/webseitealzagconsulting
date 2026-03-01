import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../auth/decorators/public.decorator';
import { ContactRequestDto } from './dto/contact-request.dto';
import { LeadsService } from './leads.service';

@Controller({
  path: 'public/contact',
  version: '1',
})
export class PublicContactController {
  constructor(private readonly leadsService: LeadsService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  create(@Body() dto: ContactRequestDto) {
    return this.leadsService.sendContactRequest(dto);
  }
}
