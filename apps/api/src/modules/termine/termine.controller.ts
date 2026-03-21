import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CreateTermineSlotDto } from './dto/create-termine-slot.dto';
import { CreateTermineTemplateDto } from './dto/create-termine-template.dto';
import { ListTermineSlotsDto } from './dto/list-termine-slots.dto';
import { UpdateTermineSlotDto } from './dto/update-termine-slot.dto';
import { UpdateTermineTemplateDto } from './dto/update-termine-template.dto';
import { TermineService } from './termine.service';

@Controller({
  path: 'termine',
  version: '1',
})
export class TermineController {
  constructor(private readonly termineService: TermineService) {}

  @Get('meta')
  meta() {
    return this.termineService.getMeta();
  }

  @Get('slots')
  listSlots(@Query() dto: ListTermineSlotsDto) {
    return this.termineService.listSlots(dto);
  }

  @Post('slots')
  createSlot(@Body() dto: CreateTermineSlotDto) {
    return this.termineService.createSlot(dto);
  }

  @Post('slots/:id/customer-suggestion')
  suggestCustomer(@Param('id') id: string) {
    return this.termineService.suggestCustomerFromSlot(id);
  }

  @Patch('slots/:id')
  updateSlot(@Param('id') id: string, @Body() dto: UpdateTermineSlotDto) {
    return this.termineService.updateSlot(id, dto);
  }

  @Delete('slots/:id')
  deleteSlot(@Param('id') id: string) {
    return this.termineService.deleteSlot(id);
  }

  @Post('slots/:id/send-reminder')
  sendReminder(@Param('id') id: string) {
    return this.termineService.sendReminder(id);
  }

  @Get('templates')
  listTemplates() {
    return this.termineService.listTemplates();
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateTermineTemplateDto) {
    return this.termineService.createTemplate(dto);
  }

  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateTermineTemplateDto,
  ) {
    return this.termineService.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.termineService.deleteTemplate(id);
  }
}
