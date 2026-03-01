import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';
import { Public } from './modules/auth/decorators/public.decorator';

@Controller({
  version: '1',
})
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getRoot() {
    return this.appService.getInfo();
  }
}
