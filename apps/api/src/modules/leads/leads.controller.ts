import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Patch,
  Query,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { LeadsService } from './leads.service';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadSettingsDto } from './dto/update-lead-settings.dto';

@Controller({
  path: 'leads',
  version: '1',
})
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async list(
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
  ) {
    return this.leadsService.listLeads(limit);
  }

  @Get('settings')
  getSettings() {
    return this.leadsService.getWorkflowSettings();
  }

  @Get('assignees')
  listAssignees() {
    return this.usersService.listAssignableUsers();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateLeadSettingsDto) {
    return this.leadsService.updateWorkflowSettings(dto);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.leadsService.getTimeline(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.leadsService.updateLead(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.leadsService.deleteLead(id);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.leadsService.markLeadRead(id);
  }

  @Post(':id/contact-extraction')
  extractContact(@Param('id') id: string) {
    return this.leadsService.extractContactRequest(id);
  }
}
